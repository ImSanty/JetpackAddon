import {
  EntityComponentTypes,
} from "@minecraft/server";
import { consumeOne, itemEntityLocation, run } from "../shared/utils.js";

export function registerItemComponents(event) {
  event.itemComponentRegistry.registerCustomComponent("is:fuel_bottle", {
    onConsume({ source }) {
      source.addEffect("poison", 200, { amplifier: 2 });
      source.addEffect("nausea", 200, { amplifier: 0 });
    },
  });

  event.itemComponentRegistry.registerCustomComponent("is:fuel_tank", {
    onUse({ source }) {
      const projectile = source.dimension.spawnEntity("is:fuel_tank", itemEntityLocation(source));
      const view = source.getViewDirection();
      const component = projectile.getComponent(EntityComponentTypes.Projectile);
      if (component) {
        component.shoot({ x: view.x * 1.5, y: view.y * 1.5, z: view.z * 1.5 });
      }

      consumeOne(source, "is:fuel_tank");
      run(source, "playsound random.bow @s ~ ~ ~ 1 1");
    },
  });
}
