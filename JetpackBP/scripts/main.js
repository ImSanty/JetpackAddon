import { system } from "@minecraft/server";
import { registerBlockComponents } from "./components/blocks.js";
import { registerItemComponents } from "./components/items.js";
import { registerJetpackSystems } from "./systems/jetpack.js";

system.beforeEvents.startup.subscribe((event) => {
  registerItemComponents(event);
  registerBlockComponents(event);
});

registerJetpackSystems();
