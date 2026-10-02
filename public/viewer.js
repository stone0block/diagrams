(async () => {
  const code = document.getElementById("code").textContent;
  const target = document.getElementById("diagram");
  const errorBox = document.getElementById("error");

  document.getElementById("copy").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => (button.textContent = "Copy code"), 1500);
  });

  function showError(error) {
    target.replaceChildren();
    target.parentElement.hidden = true;
    errorBox.hidden = false;
    errorBox.replaceChildren();
    const message = document.createElement("p");
    message.textContent = "This diagram could not be drawn because its code has an error. The code is below, the details may help to fix it.";
    const details = document.createElement("pre");
    details.textContent = String((error && error.message) || error);
    errorBox.append(message, details);
    document.getElementById("code-block").open = true;
  }

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      suppressErrorRendering: true,
      maxTextSize: 50000,
    });
    await mermaid.parse(code);
    const { svg } = await mermaid.render("diagram-svg", code);
    target.innerHTML = svg;
    // Links in labels come from untrusted code: open them in a new tab without leaking the page address.
    for (const link of target.querySelectorAll("a")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer nofollow");
    }
  } catch (error) {
    document.getElementById("diagram-svg")?.remove();
    document.getElementById("ddiagram-svg")?.remove();
    showError(error);
  }
})();
