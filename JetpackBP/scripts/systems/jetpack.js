import {
  ButtonState,
  EntityComponentTypes,
  EquipmentSlot,
  InputButton,
  system,
  world
} from '@minecraft/server';
import {
  JETPACK,
  JETPACK_ENGINE,
  JETPACK_FUEL,
  JETPACK_HOVER
} from '../shared/constants.js';
import {
  objective,
  rotationFromYaw,
  run,
  score,
  setScore,
  setState
} from '../shared/utils.js';

const JETPACK_VERTICAL_SPEED = 0.4;
const JETPACK_HORIZONTAL_SPEED = 0.18;
const JETPACK_ACCELERATION = 0.35;
const JETPACK_HOVER_SPEED = 0.0;
const JETPACK_HOVER_VERTICAL_SPEED = 0.4;
const JETPACK_SWIM_MODIFIER = 1.8;
const JETPACK_ELYTRA_BOOST = 1.25;
const HOVER_STABILIZE_Y = 0.0;
const HOVER_VERTICAL_DAMPING = 0.25;
const HOVER_BRAKE = 0.2;
const TOGGLE_WINDOW_TICKS = 10;
const FUEL_PLACEHOLDER = 1200;

const sneakTapState = new Map();

function equippedFullJetpack(player) {
  return (
    player
      .getComponent(EntityComponentTypes.Equippable)
      ?.getEquipment(EquipmentSlot.Chest)?.typeId === JETPACK
  );
}

function ensureJetpackState(player) {
  if (score(player, JETPACK_ENGINE, -1) === -1) {
    setScore(player, JETPACK_ENGINE, 1);
  }
  if (score(player, JETPACK_HOVER, -1) === -1) {
    setScore(player, JETPACK_HOVER, 0);
  }
  if (score(player, JETPACK_FUEL, -1) === -1) {
    setScore(player, JETPACK_FUEL, FUEL_PLACEHOLDER);
  }
}

function isEngineEnabled(player) {
  ensureJetpackState(player);
  return score(player, JETPACK_ENGINE) === 1;
}

function isHoverEnabled(player) {
  ensureJetpackState(player);
  return score(player, JETPACK_HOVER) === 1;
}

function setHoverEnabled(player, enabled) {
  setScore(player, JETPACK_HOVER, enabled ? 1 : 0);
  player.onScreenDisplay.setActionBar(
    `§l§aHover Mode: §r${enabled ? 'On' : 'Off'}`
  );
}

function toggleHoverMode(player) {
  setHoverEnabled(player, !isHoverEnabled(player));
}

function normalizeHorizontal(vector) {
  const length = Math.hypot(vector.x, vector.z);
  if (length <= 0.0001) {
    return { x: 0, z: 0 };
  }

  return {
    x: vector.x / length,
    z: vector.z / length
  };
}

function getFacingBasis(player) {
  const yaw = (player.getRotation().y * Math.PI) / 180;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  return {
    forward: { x: -sin, z: cos },
    right: { x: cos, z: sin }
  };
}

function getHorizontalInputTarget(player, horizontalSpeed) {
  const movement = player.inputInfo.getMovementVector();
  if (Math.abs(movement.x) <= 0.001 && Math.abs(movement.y) <= 0.001)
    return null;

  const { forward, right } = getFacingBasis(player);
  const weightedForward = movement.y >= 0 ? movement.y * 1.2 : movement.y * 0.8;
  const localX = movement.x;
  const localZ = weightedForward;

  const worldX = right.x * localX + forward.x * localZ;
  const worldZ = right.z * localX + forward.z * localZ;
  const length = Math.hypot(worldX, worldZ);
  if (length <= 0.0001) return null;
  return {
    x: (worldX / length) * horizontalSpeed,
    z: (worldZ / length) * horizontalSpeed
  };
}

function applyElytraBoost(player) {
  if (!player.isGliding) return false;

  const jumpHeld =
    player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  if (!jumpHeld) return false;
  if (system.currentTick % 15 !== 0) return true;

  const look = player.getViewDirection();
  const factor = (value) =>
    value * 0.1 + (value * JETPACK_ELYTRA_BOOST - value) * 0.5;
  player.applyImpulse({
    x: factor(look.x),
    y: factor(look.y),
    z: factor(look.z)
  });
  return true;
}

function applyCreateStyleFlight(player) {
  const velocity = player.getVelocity();
  const jumpHeld =
    player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  const sneakHeld =
    player.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
  const hoverEnabled = isHoverEnabled(player);
  const hoveringUnderwater = hoverEnabled && player.isSwimming;

  const verticalSpeed = hoverEnabled
    ? JETPACK_HOVER_VERTICAL_SPEED
    : JETPACK_VERTICAL_SPEED;
  const horizontalSpeed = hoverEnabled
    ? hoveringUnderwater
      ? 0
      : JETPACK_HORIZONTAL_SPEED * 0.8
    : JETPACK_HORIZONTAL_SPEED;

  let targetVertical = null;
  if (jumpHeld) {
    targetVertical = verticalSpeed;
  } else if (sneakHeld) {
    targetVertical = -verticalSpeed;
  } else if (hoveringUnderwater) {
    targetVertical = 0;
  } else if (hoverEnabled) {
    targetVertical = JETPACK_HOVER_SPEED;
  }

  if (targetVertical === null) return false;

  let movedHorizontally = false;
  let targetX = velocity.x;
  let targetZ = velocity.z;
  if (horizontalSpeed > 0) {
    const inputTarget = getHorizontalInputTarget(player, horizontalSpeed);
    if (inputTarget) {
      movedHorizontally = true;
      targetX = inputTarget.x;
      targetZ = inputTarget.z;
    } else if (hoverEnabled) {
      targetX = velocity.x * (1 - HOVER_BRAKE);
      targetZ = velocity.z * (1 - HOVER_BRAKE);
    } else {
      targetX = velocity.x * 0.98;
      targetZ = velocity.z * 0.98;
    }
  }

  if (hoverEnabled && !jumpHeld && !sneakHeld) {
    // Soft altitude lock while hovering in place.
    targetVertical = HOVER_STABILIZE_Y;
  }

  const targetMotionY =
    targetVertical <= 0
      ? Math.max(velocity.y, targetVertical)
      : Math.min(velocity.y + JETPACK_ACCELERATION, targetVertical);

  const verticalGain = hoverEnabled
    ? HOVER_VERTICAL_DAMPING
    : JETPACK_ACCELERATION;
  player.applyImpulse({
    x: (targetX - velocity.x) * JETPACK_ACCELERATION,
    y: (targetMotionY - velocity.y) * verticalGain,
    z: (targetZ - velocity.z) * JETPACK_ACCELERATION
  });

  if (hoverEnabled) {
    player.addEffect('slow_falling', 6, { amplifier: 0, showParticles: false });
  }

  // run(
  //   player.dimension,
  //   `particle is:jetpack_smoke ${player.location.x} ${player.location.y + 0.4} ${player.location.z}`
  // );
  return true;
}

function applyUnderwaterBoost(player) {
  const look = player.getViewDirection();
  const forward = normalizeHorizontal(look);
  player.applyImpulse({
    x: forward.x * JETPACK_HORIZONTAL_SPEED * JETPACK_SWIM_MODIFIER,
    y: look.y * JETPACK_HORIZONTAL_SPEED * 0.5,
    z: forward.z * JETPACK_HORIZONTAL_SPEED * JETPACK_SWIM_MODIFIER
  });
}

function handleHoverToggle({ button, newButtonState, player }) {
  if (button !== InputButton.Sneak || newButtonState !== ButtonState.Pressed)
    return;
  if (!equippedFullJetpack(player)) return;

  const currentTick = system.currentTick;
  const lastTapTick = sneakTapState.get(player.id) ?? -999;
  sneakTapState.set(player.id, currentTick);

  if (currentTick - lastTapTick <= TOGGLE_WINDOW_TICKS) {
    toggleHoverMode(player);
    sneakTapState.set(player.id, -999);
  }
}

function handlePlacedJetpackStand({ block, player }) {
  if (block.typeId !== 'is:jetpack_stand') return;

  system.run(() => {
    setState(block, 'is:rotation', rotationFromYaw(player.getRotation().y));
  });
}

function tickJetpacks() {
  objective(JETPACK_ENGINE, JETPACK_ENGINE);
  objective(JETPACK_HOVER, JETPACK_HOVER);
  objective(JETPACK_FUEL, JETPACK_FUEL);

  for (const player of world.getPlayers()) {
    if (!equippedFullJetpack(player)) continue;
    ensureJetpackState(player);
    if (!isEngineEnabled(player)) continue;

    if (player.isSwimming && player.isSprinting) {
      applyUnderwaterBoost(player);
      continue;
    }

    if (applyElytraBoost(player)) {
      continue;
    }

    const jumpHeld =
      player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    const sneakHeld =
      player.inputInfo.getButtonState(InputButton.Sneak) ===
      ButtonState.Pressed;
    const hoverEnabled = isHoverEnabled(player);
    if (player.isOnGround && !jumpHeld) continue;
    if (!jumpHeld && !sneakHeld && !hoverEnabled) continue;

    applyCreateStyleFlight(player);
  }
}

export function registerJetpackSystems() {
  world.afterEvents.playerPlaceBlock.subscribe(handlePlacedJetpackStand);
  world.afterEvents.playerButtonInput.subscribe(handleHoverToggle);
  system.runInterval(tickJetpacks, 1);
}
