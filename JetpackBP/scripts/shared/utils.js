import {
  EntityComponentTypes,
  EquipmentSlot,
  GameMode,
  world,
} from "@minecraft/server";

export function objective(id, name = id) {
  return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, name);
}

export function score(player, id, fallback = 0) {
  return objective(id).getScore(player) ?? fallback;
}

export function setScore(player, id, value) {
  objective(id).setScore(player, value);
}

export function mainhand(player) {
  return player.getComponent(EntityComponentTypes.Equippable)?.getEquipment(EquipmentSlot.Mainhand);
}

export function chest(player) {
  return player.getComponent(EntityComponentTypes.Equippable)?.getEquipment(EquipmentSlot.Chest);
}

export function setState(block, state, value) {
  block.setPermutation(block.permutation.withState(/** @type {any} */ (state), value));
}

export function center(block) {
  const { x, y, z } = block.location;
  return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
}

export function run(source, command) {
  try {
    source.runCommand(command);
  } catch {
    // Commands may fail during reloads or if a target disappears in the same tick.
  }
}

export function playBlockSound(block, sound) {
  const { x, y, z } = center(block);
  run(block.dimension, `playsound ${sound} @a ${x} ${y} ${z} 1 1`);
}

export function heldType(player) {
  return mainhand(player)?.typeId;
}

export function isCreative(player) {
  return player.getGameMode() === GameMode.Creative;
}

export function consumeOne(player, itemId) {
  if (!isCreative(player)) {
    run(player, `clear @s ${itemId} 0 1`);
  }
}

export function itemEntityLocation(player) {
  const view = player.getViewDirection();
  return {
    x: player.location.x + view.x,
    y: player.location.y + 1.4 + view.y * 0.5,
    z: player.location.z + view.z,
  };
}

export function rotationFromYaw(yaw) {
  const normalized = ((yaw % 360) + 360) % 360;
  if (normalized >= 45 && normalized < 135) return 5;
  if (normalized >= 135 && normalized < 225) return 2;
  if (normalized >= 225 && normalized < 315) return 4;
  return 3;
}
