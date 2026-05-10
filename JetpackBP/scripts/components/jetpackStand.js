import { ItemStack } from "@minecraft/server";
import { JETPACK, JETPACK_EMPTY } from "../shared/constants.js";
import { center, consumeOne, heldType, playBlockSound, run, setState } from "../shared/utils.js";

export function registerJetpackStandComponent(event) {
  event.blockComponentRegistry.registerCustomComponent("is:jetpack_stand", {
    onPlayerInteract({ block, player }) {
      if (!player) return;

      const state = Number(block.permutation.getState(/** @type {any} */ ("is:jetpack_stand_states")) ?? 0);
      const item = heldType(player);

      if (state === 0 && item === JETPACK_EMPTY) {
        setState(block, "is:jetpack_stand_states", 1);
        consumeOne(player, JETPACK_EMPTY);
        playBlockSound(block, "armor.equip_iron");
        return;
      }

      if (state === 1 && item === "is:fuel_bottle") {
        setState(block, "is:jetpack_stand_states", 2);
        consumeOne(player, "is:fuel_bottle");
        run(player, "give @s minecraft:glass_bottle 1");
        playBlockSound(block, "bottle.dragonbreath");
        return;
      }

      if (state === 6) {
        setState(block, "is:jetpack_stand_states", 0);
        block.dimension.spawnItem(new ItemStack(JETPACK, 1), center(block));
        playBlockSound(block, "armor.equip_iron");
      }
    },

    onTick({ block }) {
      const state = Number(block.permutation.getState(/** @type {any} */ ("is:jetpack_stand_states")) ?? 0);
      if (state < 2 || state > 5) return;

      setState(block, "is:jetpack_stand_states", state + 1);
      playBlockSound(block, state === 5 ? "beacon.deactivate" : "bottle.dragonbreath");
    },
  });
}
