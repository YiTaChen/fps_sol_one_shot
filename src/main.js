import "./style.css";
import { Game } from "./game/Game.js";

const container = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
const seedValue = Number.parseInt(params.get("seed") || "20364033", 10);
const options = {
  seed: Number.isFinite(seedValue) ? seedValue : 20364033,
  quality: params.get("quality") || (params.has("capture") ? "high" : "high"),
  capture: params.has("capture"),
  captureMode: params.get("capture"),
  test: params.get("test") === "1",
};

try {
  const game = new Game(container, options);
  game.start();
  window.__CINDERLINE__ = game;
} catch (error) {
  const message = document.createElement("pre");
  message.className = "boot-error";
  message.textContent = `CINDERLINE FAILED TO INITIALIZE\n\n${error.stack || error}`;
  container.replaceChildren(message);
  throw error;
}

