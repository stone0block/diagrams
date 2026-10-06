import "@excalidraw/excalidraw/index.css";
import {
  Excalidraw,
  FONT_FAMILY,
  MainMenu,
  convertToExcalidrawElements,
  exportToCanvas,
  exportToSvg,
  getCommonBounds,
  mutateElement,
} from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Scene = { elements: readonly ExcalidrawElement[]; files: BinaryFiles };

const mount = document.getElementById("app")!;
const id = mount.dataset.id ?? "";
const title = mount.dataset.title ?? "Diagram";
const brand = mount.dataset.brand ?? "Diagrams";
const code = document.getElementById("code")?.textContent ?? "";

const storageKey = `diagram-scene:${id}`;
const hintKey = "diagrams-hint-seen";
const WATERMARK_HEIGHT = 44;
const PADDING = 24;
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

// Clean look instead of Excalidraw's hand-drawn default: straight lines and a plain sans-serif font.
// Mermaid sizes the blocks for a sans-serif font, so a hand-drawn font would overflow them.
const FONT = FONT_FAMILY.Nunito;
const FONT_SIZE = 16;

// Our own colors for a flowchart from Claude, by the role of the block. Colors written in the Mermaid
// code itself (style, classDef) win. Class and ER boxes get a plain white fill. Sequence and state
// diagrams keep the converter's look: their frames lie over other parts, a solid fill would hide them.
const FILLS = { process: "#ffffff", terminal: "#dff3ea", decision: "#fdf0cf", group: "#f1efe9" };

const GROUP_STROKE = "#b5b0a3";

// A subgraph frame: a rectangle with its title at the top.
const isGroup = (element: Record<string, any>) => element.type === "rectangle" && element.label?.verticalAlign === "top";

function fillFor(element: Record<string, any>): string | null {
  if (element.backgroundColor) return null;
  if (element.type === "diamond") return FILLS.decision;
  if (element.type === "ellipse") return FILLS.terminal;
  if (element.type !== "rectangle") return null;
  if (isGroup(element)) return FILLS.group;
  return element.roundness ? FILLS.terminal : FILLS.process;
}

// The dot grid behind the canvas (see .canvas in style.css) follows Excalidraw's scroll and zoom.
// When zoomed far out, every second dot is dropped until the dots are far enough apart again.
const GRID = 20;
function syncDots(target: HTMLElement, view: { scrollX: number; scrollY: number; zoom: { value: number } }) {
  const zoom = view.zoom.value;
  let step = GRID;
  while (step * zoom < 14) step *= 2;
  const size = step * zoom;
  target.style.setProperty("--grid", `${size}px`);
  target.style.setProperty("--grid-x", `${view.scrollX * zoom - size / 2}px`);
  target.style.setProperty("--grid-y", `${view.scrollY * zoom - size / 2}px`);
}

// Mermaid gives every flowchart arrow a path through its layout. An arrow between neighbouring blocks is
// replaced with something tidier when that is safe:
//  - an elbow arrow: right angles that Excalidraw routes itself and re-routes when a block is dragged;
//  - a plain straight arrow, when the two ends nearly face each other and an elbow would make a tiny step.
// Mermaid's own path is kept for arrows that span several rows (it goes around the blocks in between),
// for two arrows running both ways between the same blocks, and for an arrow that would have to share a
// corner of a diamond with an arrow of the opposite direction (it keeps such arrows apart).
type Side = "top" | "right" | "bottom" | "left";
type Port = { node: any; side: Side; along: number; out: boolean; mixed?: boolean };
type Plan = { kind: "straight" } | { kind: "elbow"; start: Port; end: Port };
const SIDES: Side[] = ["bottom", "top", "right", "left"];
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const BIND_GAP = 5;
const MAX_STEP = 40;

// (x, y) is where Mermaid attached the arrow to the block; `other` is the block at the far end.
function portAt(node: any, other: any, x: number, y: number, out: boolean, tidy: boolean): Port {
  let nx = (x - node.x) / node.width;
  let ny = (y - node.y) / node.height;
  if (tidy && node.type !== "rectangle") {
    // A diamond or an ellipse is touched at a corner: a side one if the other block lies clear to the
    // side, otherwise the top or the bottom one.
    const dx = other.x + other.width / 2 - (node.x + node.width / 2);
    const dy = other.y + other.height / 2 - (node.y + node.height / 2);
    const aside = Math.abs(dx) > node.width / 2;
    nx = aside ? (dx < 0 ? 0 : 1) : 0.5;
    ny = aside ? 0.5 : dy < 0 ? 0 : 1;
  }
  const horizontal = Math.abs(nx - 0.5) > Math.abs(ny - 0.5);
  const side = horizontal ? (nx < 0.5 ? "left" : "right") : ny < 0.5 ? "top" : "bottom";
  return { node, side, along: Math.min(0.85, Math.max(0.15, horizontal ? ny : nx)), out };
}

// Where an arrow touches a block, on the canvas: just outside the given side.
function portPoint({ node, side, along }: Port): [number, number] {
  if (side === "top") return [node.x + along * node.width, node.y - BIND_GAP];
  if (side === "bottom") return [node.x + along * node.width, node.y + node.height + BIND_GAP];
  if (side === "left") return [node.x - BIND_GAP, node.y + along * node.height];
  return [node.x + node.width + BIND_GAP, node.y + along * node.height];
}

// The same place as Excalidraw stores it in a binding: a ratio of the block's width and height.
const fixedPoint = (node: any, [x, y]: readonly [number, number]): [number, number] => [
  (x - node.x) / node.width,
  (y - node.y) / node.height,
];

function planArrows(skeleton: Record<string, any>[]): Map<string, Plan> {
  const blocks = new Map(skeleton.filter((element) => element.type !== "arrow").map((element) => [element.id, element]));
  const arrows = skeleton.filter(
    (element) => element.type === "arrow" && blocks.has(element.start?.id) && blocks.has(element.end?.id),
  );
  const count = new Map<string, number>();
  for (const arrow of arrows) {
    const pair = `${arrow.start.id}>${arrow.end.id}`;
    count.set(pair, (count.get(pair) ?? 0) + 1);
  }

  const routes = arrows.map((arrow) => {
    const from = blocks.get(arrow.start.id)!;
    const to = blocks.get(arrow.end.id)!;
    const [sx, sy] = arrow.points[0];
    const [ex, ey] = arrow.points.at(-1);
    const tidy =
      from !== to &&
      arrow.points.length <= 3 &&
      count.get(`${from.id}>${to.id}`) === 1 &&
      !count.has(`${to.id}>${from.id}`);
    return {
      arrow,
      tidy,
      start: portAt(from, to, arrow.x + sx, arrow.y + sy, true, tidy),
      end: portAt(to, from, arrow.x + ex, arrow.y + ey, false, tidy),
    };
  });

  // One side of a block may carry several arrows. All leaving or all arriving: they share its middle,
  // like a tree. Mixed: on a rectangle each keeps the place Mermaid chose. A diamond or an ellipse has
  // only its four corners, so an arriving arrow moves to a free one or, if there is none, stays as it was.
  const ports = routes.flatMap((route) => [route.start, route.end]);
  for (const route of routes) {
    if (!route.tidy) continue;
    for (const port of [route.start, route.end]) {
      const onBlock = ports.filter((other) => other.node === port.node);
      const shared = onBlock.filter((other) => other.side === port.side);
      if (shared.every((other) => other.out === port.out)) {
        port.along = 0.5;
      } else if (port.node.type === "rectangle") {
        port.mixed = true;
      } else {
        port.along = 0.5;
        const free = SIDES.find((side) => onBlock.every((other) => other.side !== side));
        if (!port.out && free) port.side = free;
        else if (!port.out) route.tidy = false;
      }
    }
  }

  const plans = new Map<string, Plan>();
  for (const { arrow, tidy, start, end } of routes) {
    if (!tidy) continue;
    let straight = false;
    if (end.side === OPPOSITE[start.side]) {
      // The ends face each other. Slide one along the side of its rectangle to make the arrow one straight
      // line; if neither can move and the step between them is small, draw a plain straight arrow.
      const vertical = start.side === "top" || start.side === "bottom";
      const at = ({ node, along }: Port) => (vertical ? node.x + along * node.width : node.y + along * node.height);
      const slide = (port: Port, target: number) => {
        const { node } = port;
        if (node.type !== "rectangle" || port.mixed) return false;
        const along = vertical ? (target - node.x) / node.width : (target - node.y) / node.height;
        const margin = node.roundness ? 0.25 : 0.12; // stay off the corners
        if (along < margin || along > 1 - margin) return false;
        port.along = along;
        return true;
      };
      const step = Math.abs(at(start) - at(end));
      straight = step > 0.5 && !slide(start, at(end)) && !slide(end, at(start)) && step < MAX_STEP;
    }
    // Excalidraw's router only steers clear of the two blocks an arrow joins. If another block lies
    // between the ends, Mermaid's path (which goes around it) is kept.
    const [x1, y1] = portPoint(start);
    const [x2, y2] = portPoint(end);
    const blocked = [...blocks.values()].some(
      (block) =>
        block !== start.node &&
        block !== end.node &&
        !isGroup(block) &&
        block.x < Math.max(x1, x2) + 4 &&
        block.x + block.width > Math.min(x1, x2) - 4 &&
        block.y < Math.max(y1, y2) + 4 &&
        block.y + block.height > Math.min(y1, y2) - 4,
    );
    if (!blocked) plans.set(arrow.id, straight ? { kind: "straight" } : { kind: "elbow", start, end });
  }
  return plans;
}

function withElbowArrows(elements: readonly ExcalidrawElement[], plans: Map<string, Plan>): ExcalidrawElement[] {
  return elements.map((element) => {
    const plan = element.type === "arrow" ? plans.get(element.id) : undefined;
    if (plan?.kind !== "elbow") return element;
    const { start, end } = plan;
    const from = portPoint(start);
    const to = portPoint(end);
    return {
      ...(element as any),
      elbowed: true,
      roundness: null,
      fixedSegments: null,
      startIsSpecial: false,
      endIsSpecial: false,
      x: from[0],
      y: from[1],
      points: [[0, 0], [to[0] - from[0], to[1] - from[1]]],
      startBinding: { elementId: start.node.id, focus: 0, gap: 0, fixedPoint: fixedPoint(start.node, from) },
      endBinding: { elementId: end.node.id, focus: 0, gap: 0, fixedPoint: fixedPoint(end.node, to) },
    };
  });
}

// Puts a converted diagram on the canvas. Elbow arrows are routed by Excalidraw once they are in the scene.
function show(api: ExcalidrawImperativeAPI, scene: Scene) {
  api.addFiles(Object.values(scene.files));
  api.updateScene({ elements: scene.elements as ExcalidrawElement[] });
  const elements = api.getSceneElements() as readonly any[];
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const arrow of elements) {
    if (arrow.type !== "arrow" || !arrow.elbowed) continue;
    try {
      // Excalidraw snaps both ends to the outlines of the blocks and finds the path between them.
      mutateElement(arrow, { points: arrow.points });
      // Remember the snapped ends in the bindings, so the arrow keeps its place when a block moves.
      const ends = [arrow.points[0], arrow.points[arrow.points.length - 1]].map(
        ([x, y]: [number, number]) => [arrow.x + x, arrow.y + y] as const,
      );
      const pin = (binding: any, point: readonly [number, number]) => {
        const node = byId.get(binding.elementId);
        return node ? { ...binding, fixedPoint: fixedPoint(node, point) } : binding;
      };
      mutateElement(arrow, { startBinding: pin(arrow.startBinding, ends[0]), endBinding: pin(arrow.endBinding, ends[1]) });
    } catch {
      // The arrow stays a straight line between its two ends; it can still be moved by hand.
    }
  }
  fitToView(api, scene.elements);
}

// The diagram code is untrusted: Mermaid runs in strict mode (no scripts or HTML from labels).
async function convert(source: string): Promise<Scene> {
  const result = await parseMermaidToExcalidraw(source, {
    // Mermaid's neutral base theme in our colors instead of its default violet. Sequence, class, ER and
    // state diagrams take their fills and lines from here, and so do the types that arrive as a picture.
    theme: "base",
    themeVariables: {
      fontSize: `${FONT_SIZE}px`,
      primaryColor: "#ffffff",
      primaryTextColor: "#1e1e1e",
      primaryBorderColor: "#1e1e1e",
      lineColor: "#1e1e1e",
      secondaryColor: FILLS.terminal,
      tertiaryColor: FILLS.group,
      actorBkg: FILLS.terminal,
      actorBorder: "#1e1e1e",
      noteBkgColor: FILLS.decision,
      noteBorderColor: "#1e1e1e",
      labelBoxBkgColor: FILLS.group,
      labelBoxBorderColor: "#1e1e1e",
      activationBkgColor: FILLS.group,
      attributeBackgroundColorOdd: "#ffffff",
      attributeBackgroundColorEven: FILLS.group,
    },
    securityLevel: "strict",
    // More air between blocks than Mermaid's default 50: room for arrow labels and for dragging.
    flowchart: { curve: "linear", nodeSpacing: 64, rankSpacing: 64 },
  } as Parameters<typeof parseMermaidToExcalidraw>[1]);
  // Text is measured when the elements are created, so the font must already be loaded (all alphabets used).
  try {
    await document.fonts.load(`${FONT_SIZE}px Nunito`, source);
  } catch {
    // Measuring falls back to a system font; blocks may be slightly tight.
  }
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${FONT_SIZE}px Nunito`;
  const flowchart = /^\s*(flowchart|graph)\b/m.test(source);
  const boxes = /^\s*(classDiagram|erDiagram)\b/m.test(source);
  // In class and ER diagrams the boxes come first and everything else is drawn over them.
  const firstOther = result.elements.findIndex((element) => element.type !== "rectangle");
  const skeleton = result.elements.map((element, index) => {
    const styled = { ...element, roughness: 0 } as Record<string, any>;
    const unfilled = !styled.backgroundColor || styled.backgroundColor === "transparent";
    const plainBox = boxes && index < firstOther && styled.type === "rectangle" && unfilled;
    const fill = flowchart ? fillFor(styled) : plainBox ? FILLS.process : null;
    if (fill) Object.assign(styled, { backgroundColor: fill, fillStyle: "solid" });
    // Filled arrowheads instead of open ones. A link without a head (null), a dot or a bar stays as written.
    if (flowchart && styled.type === "arrow") {
      if (styled.endArrowhead === undefined || styled.endArrowhead === "arrow") styled.endArrowhead = "triangle";
      if (styled.startArrowhead === "arrow") styled.startArrowhead = "triangle";
    }
    if (styled.type === "text") styled.fontFamily = FONT;
    if (styled.label) styled.label = { ...styled.label, fontFamily: FONT };
    if (flowchart && isGroup(styled)) {
      // A quiet frame with its title in the corner, out of the way of arrows that enter from the middle.
      styled.strokeColor ??= GROUP_STROKE;
      styled.strokeWidth = 1;
      styled.label = { ...styled.label, textAlign: "left" };
    }
    if ((styled.type === "ellipse" || styled.type === "diamond") && styled.label?.text) {
      // Excalidraw puts the text of an ellipse or a diamond into a box well inside the shape (about 70%
      // and 50% of each side). Mermaid sizes these shapes tighter, so grow the shape around its center
      // until the label fits without breaking inside a word.
      const share = styled.type === "ellipse" ? 0.7 : 0.5;
      const width = (text: string) => measure.measureText(text).width;
      let needW: number;
      let lines: number;
      if (styled.type === "ellipse") {
        const rows = String(styled.label.text).split("\n");
        needW = Math.max(...rows.map(width)) + 16;
        lines = rows.length;
      } else {
        // A diamond may wrap its label at spaces: every word must fit, then count the wrapped lines.
        const words = String(styled.label.text).split(/\s+/);
        needW = Math.max(...words.map(width)) + 16;
        const room = Math.max(needW, styled.width * share) - 12;
        lines = 1;
        let row = "";
        for (const word of words) {
          const next = row ? `${row} ${word}` : word;
          if (row && width(next) > room) {
            lines++;
            row = word;
          } else {
            row = next;
          }
        }
      }
      const needH = lines * FONT_SIZE * 1.25 + 12;
      for (const [pos, size, need] of [["x", "width", needW / share], ["y", "height", needH / share]] as const) {
        if (styled[size] < need) {
          styled[pos] -= (need - styled[size]) / 2;
          styled[size] = need;
        }
      }
    }
    return styled;
  });
  const plans = flowchart ? planArrows(skeleton) : new Map<string, Plan>();
  const tidied = skeleton.map((element) =>
    element.type === "arrow" && plans.get(element.id)?.kind === "straight"
      ? { ...element, points: [element.points[0], element.points.at(-1)], roundness: null }
      : element,
  );
  const elements = convertToExcalidrawElements(tidied as typeof result.elements, { regenerateIds: false });
  return { elements: withElbowArrows(elements, plans), files: result.files ?? {} };
}

function usedFiles(elements: readonly ExcalidrawElement[], files: BinaryFiles): BinaryFiles {
  const used: BinaryFiles = {};
  for (const element of elements) {
    if (element.type === "image" && element.fileId && files[element.fileId]) {
      used[element.fileId] = files[element.fileId];
    }
  }
  return used;
}

function loadSaved(): Scene | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.elements) || data.elements.length === 0) return null;
    return { elements: data.elements, files: data.files ?? {} };
  } catch {
    return null;
  }
}

function slug(text: string): string {
  const s = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 60) || "diagram";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const exportState = (api: ExcalidrawImperativeAPI) => ({
  elements: api.getSceneElements(),
  files: api.getFiles(),
  appState: {
    ...api.getAppState(),
    exportBackground: true,
    viewBackgroundColor: "#ffffff",
    exportWithDarkMode: false,
    exportScale: 1,
  },
});

// Free export carries a watermark strip under the diagram (ТЗ E-1). The wording is a placeholder until Stage 4.
const watermarkText = `Made with ${brand}`;

async function exportPng(api: ExcalidrawImperativeAPI) {
  const { elements, files, appState } = exportState(api);
  const scale = 2;
  const canvas = await exportToCanvas({
    elements,
    files,
    appState,
    exportPadding: PADDING,
    getDimensions: (width: number, height: number) => ({ width: width * scale, height: height * scale, scale }),
  });
  const bar = WATERMARK_HEIGHT * scale;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height + bar;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "#6b7280";
  ctx.font = `${16 * scale}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(watermarkText, out.width - 16 * scale, canvas.height + bar / 2);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (blob) download(blob, `${slug(title)}.png`);
}

async function exportSvg(api: ExcalidrawImperativeAPI) {
  const { elements, files, appState } = exportState(api);
  const svg = await exportToSvg({ elements, files, appState, exportPadding: PADDING });
  // Work in the viewBox's own units: the width/height attributes may carry an export scale.
  const { width, height } = svg.viewBox.baseVal;
  const unit = (Number(svg.getAttribute("width")) || width) / width;
  const ns = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", `0 0 ${width} ${height + WATERMARK_HEIGHT}`);
  svg.setAttribute("height", String((height + WATERMARK_HEIGHT) * unit));
  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", String(height));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(WATERMARK_HEIGHT));
  rect.setAttribute("fill", "#ffffff");
  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", String(width - 16));
  text.setAttribute("y", String(height + WATERMARK_HEIGHT / 2));
  text.setAttribute("text-anchor", "end");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("font-family", "system-ui, -apple-system, 'Segoe UI', sans-serif");
  text.setAttribute("font-size", "16");
  text.setAttribute("fill", "#6b7280");
  text.textContent = watermarkText;
  svg.append(rect, text);
  const markup = new XMLSerializer().serializeToString(svg);
  download(new Blob([markup], { type: "image/svg+xml" }), `${slug(title)}.svg`);
}

// Keep the content clear of Excalidraw's toolbar and zoom controls, and never zoom in past 100%.
// A diagram too big to read when fitted whole opens at a readable zoom from its top left corner instead.
const MIN_OPEN_ZOOM = 0.5;
const OFFSETS = { top: 96, bottom: 56, left: 16, right: 16 };
function fitToView(api: ExcalidrawImperativeAPI, elements: readonly ExcalidrawElement[]) {
  if (elements.length === 0) return;
  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  const { width, height } = api.getAppState();
  const roomX = width - OFFSETS.left - OFFSETS.right;
  const roomY = height - OFFSETS.top - OFFSETS.bottom;
  const fit = 0.9 * Math.min(roomX / (maxX - minX), roomY / (maxY - minY));
  if (!(fit < MIN_OPEN_ZOOM)) {
    api.scrollToContent(elements, {
      fitToViewport: true,
      viewportZoomFactor: 0.9,
      maxZoom: 1,
      animate: false,
      canvasOffsets: OFFSETS,
    });
    return;
  }
  const zoom = MIN_OPEN_ZOOM;
  // Screen position = (scene position + scroll) * zoom. Center an axis that fits, start at the edge otherwise.
  const place = (min: number, max: number, offset: number, room: number) => {
    const size = (max - min) * zoom;
    return (offset + (size < room ? (room - size) / 2 : 12)) / zoom - min;
  };
  api.updateScene({
    appState: {
      zoom: { value: zoom as AppState["zoom"]["value"] },
      scrollX: place(minX, maxX, OFFSETS.left, roomX),
      scrollY: place(minY, maxY, OFFSETS.top, roomY),
    },
  });
}

// Icons and the logo are drawn here by hand (same shapes as in src/pages.ts).
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);
const icons = {
  code: <path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14" />,
  reset: <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4.5v4.6h4.6" />,
  download: <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19.5h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 5 4.5" />
    </>
  ),
  vector: (
    <>
      <rect x="3" y="15" width="5" height="5" rx="1" />
      <rect x="16" y="4" width="5" height="5" rx="1" />
      <path d="M8 17.5c6 0 4-11 8-11" />
    </>
  ),
};

const Mark = () => (
  <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
    <rect className="mark-bg" width="28" height="28" rx="7" />
    <rect className="mark-line" x="6.5" y="6.5" width="7" height="7" rx="1.5" />
    <path className="mark-line" d="M10 13.5v2.5a2 2 0 0 0 2 2h3" />
    <path className="mark-dot" d="M18.5 14.2l3.8 3.8-3.8 3.8-3.8-3.8z" />
  </svg>
);

function ExportMenu(props: { disabled: boolean; onPng: () => void; onSvg: () => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (task: () => void) => () => {
    setOpen(false);
    task();
  };

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        type="button"
        className="btn primary"
        disabled={props.disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon>{icons.download}</Icon>
        Export
        <Icon>{icons.chevron}</Icon>
      </button>
      {open && (
        <div className="popover" role="menu">
          <button type="button" role="menuitem" onClick={pick(props.onPng)}>
            <Icon>{icons.image}</Icon>
            <div>
              <strong>PNG image</strong>
              <span>For docs, slides and chats</span>
            </div>
          </button>
          <button type="button" role="menuitem" onClick={pick(props.onSvg)}>
            <Icon>{icons.vector}</Icon>
            <div>
              <strong>SVG vector</strong>
              <span>Stays sharp at any size</span>
            </div>
          </button>
          <p className="foot">Files carry a small “{watermarkText}” mark below the diagram.</p>
        </div>
      )}
    </div>
  );
}

function ConfirmReset(props: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (props.open && !node.open) node.showModal();
    if (!props.open && node.open) node.close();
  }, [props.open]);
  return (
    <dialog ref={dialog} className="confirm" aria-labelledby="reset-title" onClose={props.onCancel}>
      <h2 id="reset-title">Start over?</h2>
      <p>Your edits on this canvas will be replaced with the original diagram. This cannot be undone.</p>
      <div className="row">
        <button type="button" className="btn" onClick={props.onCancel}>
          Keep my edits
        </button>
        <button type="button" className="btn primary" onClick={props.onConfirm}>
          Start over
        </button>
      </div>
    </dialog>
  );
}

function App() {
  const [stored] = useState(loadSaved);
  const [loading, setLoading] = useState(stored === null);
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem(hintKey) === null;
    } catch {
      return false;
    }
  });
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pendingFit = useRef(stored !== null);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastSaved = useRef(stored ? JSON.stringify({ elements: stored.elements, files: stored.files }) : "");

  // Excalidraw mounts first (so its fonts are registered), then the Mermaid code is turned into shapes.
  useEffect(() => {
    apiRef.current = api;
    if (!api || stored) return;
    convert(code)
      .then((scene) => show(api, scene))
      .catch((e: unknown) => {
        setError(String((e as Error)?.message ?? e));
      })
      .finally(() => setLoading(false));
  }, [api, stored]);

  const onChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    // Our page chrome and the dot grid follow the canvas: its theme switch, scroll and zoom.
    if (document.documentElement.dataset.theme !== appState.theme) {
      document.documentElement.dataset.theme = appState.theme;
    }
    if (canvasRef.current) syncDots(canvasRef.current, appState);

    if (pendingFit.current && apiRef.current && elements.length > 0) {
      pendingFit.current = false;
      fitToView(apiRef.current, elements);
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const live = elements.filter((el) => !el.isDeleted);
      try {
        if (live.length === 0) {
          localStorage.removeItem(storageKey);
          lastSaved.current = "";
          return;
        }
        const json = JSON.stringify({ elements: live, files: usedFiles(live, files) });
        if (json === lastSaved.current) return;
        localStorage.setItem(storageKey, json);
        lastSaved.current = json;
        setSaved(true);
      } catch {
        // Storage full or blocked: the editor keeps working, edits just are not kept.
      }
    }, 600);
  }, []);

  async function startOver() {
    setConfirmOpen(false);
    if (!api) return;
    setBusy(true);
    try {
      const scene = await convert(code);
      localStorage.removeItem(storageKey);
      lastSaved.current = "";
      setSaved(false);
      setError(null);
      show(api, scene);
      api.history.clear();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function run(task: (api: ExcalidrawImperativeAPI) => Promise<void>) {
    if (!api || busy) return;
    setBusy(true);
    try {
      await task(api);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.setTimeout(() => setCopied(false), 1500);
  }

  function dismissHint() {
    setHint(false);
    try {
      localStorage.setItem(hintKey, "1");
    } catch {
      // Storage blocked: the hint comes back on the next visit.
    }
  }

  const ready = api !== null && !busy && !loading;

  return (
    <>
      <header className="app-header">
        <a className="brand" href="/" title={`${brand}: home`}>
          <Mark />
          <span>{brand}</span>
        </a>
        <span className="sep" />
        <h1 className="app-title" title={title}>
          {title}
        </h1>
        <span
          className="status"
          title="Edits are kept in this browser only. They are not uploaded and do not move to other devices."
        >
          {saved && <Icon>{icons.check}</Icon>}
          <span>{saved ? "Saved in this browser" : "Edits stay in this browser"}</span>
        </span>
        <div className="actions">
          <button
            type="button"
            className="btn ghost"
            title="See and copy the Mermaid code of this diagram"
            aria-pressed={codeOpen}
            onClick={() => setCodeOpen((open) => !open)}
          >
            <Icon>{icons.code}</Icon>
            <span>Code</span>
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Bring back the original diagram"
            disabled={!ready}
            onClick={() => setConfirmOpen(true)}
          >
            <Icon>{icons.reset}</Icon>
            <span>Start over</span>
          </button>
          <ExportMenu disabled={!ready} onPng={() => run(exportPng)} onSvg={() => run(exportSvg)} />
        </div>
      </header>
      <div className="canvas" ref={canvasRef}>
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{
            elements: stored?.elements ?? [],
            files: stored?.files ?? {},
            appState: {
              theme: prefersDark ? "dark" : "light",
              // Transparent: the dot grid of the page shows through. Exports get a white background.
              viewBackgroundColor: "transparent",
              objectsSnapModeEnabled: true,
              currentItemRoughness: 0,
              currentItemFontFamily: FONT,
              currentItemFontSize: FONT_SIZE,
            },
          }}
          onChange={onChange}
          aiEnabled={false}
          langCode="en"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
              changeViewBackgroundColor: false,
            },
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.ItemLink href="/editor/licenses.txt">Open-source licenses</MainMenu.ItemLink>
          </MainMenu>
        </Excalidraw>
        {loading && <p className="loading">Drawing the diagram…</p>}
        {hint && !loading && !error && (
          <div className="hint">
            <span>Drag a block to move it. Double-click it to change the text.</span>
            <button type="button" className="btn" onClick={dismissHint}>
              Got it
            </button>
          </div>
        )}
        {error && (
          <div className="notice error float" role="alert">
            <p>
              This diagram could not be drawn because its code has an error. The details below may help to fix it; the
              code is under “Code”. The canvas is empty: you can still draw.
            </p>
            <pre>{error}</pre>
          </div>
        )}
        {codeOpen && (
          <aside className="code-panel" aria-label="Mermaid code">
            <div className="code-panel-bar">
              <strong>Mermaid code</strong>
              <button type="button" className="btn" onClick={copyCode}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setCodeOpen(false)}>
                Close
              </button>
            </div>
            <pre>{code}</pre>
            <p className="muted">This is the diagram as it was saved. Edits on the canvas do not change the code.</p>
          </aside>
        )}
      </div>
      <ConfirmReset open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={startOver} />
    </>
  );
}

createRoot(mount).render(<App />);
