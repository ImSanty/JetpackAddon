import { registerJetpackStandComponent } from "./jetpackStand.js";

export function registerBlockComponents(event) {
  event.blockComponentRegistry.registerCustomComponent("is:petroleum_block", {
    onStepOn({ entity }) {
      if (!entity) return;
      entity.addEffect("nausea", 200, { amplifier: 0 });
    },
  });

  registerJetpackStandComponent(event);
}
