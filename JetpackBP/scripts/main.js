import {
  ButtonState,
  EntityComponentTypes,
  EquipmentSlot,
  GameMode,
  InputButton,
  ItemStack,
  system,
  world,
} from "@minecraft/server";

const JETPACK = "is:jetpack";
const JETPACK_EMPTY = "is:jetpack_empty";
const JETPACK_FUEL = "jetpack_fuel";
const POWER_MODE = "power_mode";
const FULL_FUEL = 1200;

function objective(id, name = id) {
  return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, name);
}

function score(player, id, fallback = 0) {
  return objective(id).getScore(player) ?? fallback;
}

function setScore(player, id, value) {
  objective(id).setScore(player, value);
}

function mainhand(player) {
  return player.getComponent(EntityComponentTypes.Equippable)?.getEquipment(EquipmentSlot.Mainhand);
}

function chest(player) {
  return player.getComponent(EntityComponentTypes.Equippable)?.getEquipment(EquipmentSlot.Chest);
}

function equippedFullJetpack(player) {
  return chest(player)?.typeId === JETPACK;
}

function setState(block, state, value) {
  block.setPermutation(block.permutation.withState(/** @type {any} */ (state), value));
}

function center(block) {
  const { x, y, z } = block.location;
  return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
}

function run(source, command) {
  try {
    source.runCommand(command);
  } catch {
    // Commands may fail during reloads or if a target disappears in the same tick.
  }
}

function playBlockSound(block, sound) {
  const { x, y, z } = center(block);
  run(block.dimension, `playsound ${sound} @a ${x} ${y} ${z} 1 1`);
}

function heldType(player) {
  return mainhand(player)?.typeId;
}

function isCreative(player) {
  return player.getGameMode() === GameMode.Creative;
}

function consumeOne(player, itemId) {
  if (!isCreative(player)) {
    run(player, `clear @s ${itemId} 0 1`);
  }
}

function itemEntityLocation(player) {
  const view = player.getViewDirection();
  return {
    x: player.location.x + view.x,
    y: player.location.y + 1.4 + view.y * 0.5,
    z: player.location.z + view.z,
  };
}

function rotationFromYaw(yaw) {
  const normalized = ((yaw % 360) + 360) % 360;
  if (normalized >= 45 && normalized < 135) return 5;
  if (normalized >= 135 && normalized < 225) return 2;
  if (normalized >= 225 && normalized < 315) return 4;
  return 3;
}

system.beforeEvents.startup.subscribe((event) => {
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

  event.blockComponentRegistry.registerCustomComponent("is:petroleum_block", {
    onStepOn({ entity }) {
      if (!entity) return;
      entity.addEffect("nausea", 200, { amplifier: 0 });
    },
  });

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
});

world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  if (block.typeId !== "is:jetpack_stand") return;

  system.run(() => {
    setState(block, "is:rotation", rotationFromYaw(player.getRotation().y));
  });
});

world.afterEvents.playerButtonInput.subscribe(({ button, newButtonState, player }) => {
  if (button !== InputButton.Sneak || newButtonState !== ButtonState.Pressed) return;
  if (!equippedFullJetpack(player)) return;

  const next = score(player, POWER_MODE) === 1 ? 0 : 1;
  setScore(player, POWER_MODE, next);
  player.onScreenDisplay.setActionBar(`§l§aPower Mode: §r${next === 1 ? "Turbo" : "Standard"}`);
});

system.runInterval(() => {
  for (const player of world.getPlayers()) {
    if (!equippedFullJetpack(player)) continue;

    let fuel = score(player, JETPACK_FUEL, FULL_FUEL);
    if (fuel <= 0) {
      player.getComponent(EntityComponentTypes.Equippable)?.setEquipment(
        EquipmentSlot.Chest,
        new ItemStack(JETPACK_EMPTY, 1)
      );
      player.onScreenDisplay.setActionBar("§cJetpack fuel empty");
      continue;
    }

    const jumpHeld = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    if (!jumpHeld) continue;

    const turbo = score(player, POWER_MODE) === 1;
    const view = player.getViewDirection();
    const lift = turbo ? 0.18 : 0.12;
    const thrust = turbo ? 0.09 : 0.05;

    player.applyImpulse({
      x: view.x * thrust,
      y: lift,
      z: view.z * thrust,
    });
    player.addEffect("slow_falling", 30, { amplifier: 0, showParticles: false });
    run(player.dimension, `particle is:jetpack_smoke ${player.location.x} ${player.location.y + 0.4} ${player.location.z}`);

    fuel = Math.max(0, fuel - (turbo ? 2 : 1));
    setScore(player, JETPACK_FUEL, fuel);
  }
}, 1);
