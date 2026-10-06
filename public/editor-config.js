// Runs before the editor bundle (a module's own code runs after its imports, too late for this setting).
// Tells Excalidraw to load its fonts from our own origin instead of a CDN.
window.EXCALIDRAW_ASSET_PATH = "/editor/";
