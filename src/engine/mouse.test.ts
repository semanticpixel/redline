import assert from "node:assert/strict";
import { parseSgrMousePackets } from "./mouse.js";

{
  const parsed = parseSgrMousePackets("\u001b[<64;10;3M\u001b[<65;10;4M");

  assert.equal(parsed.rest, "");
  assert.deepEqual(parsed.events, [
    {
      type: "wheel",
      x: 9,
      y: 2,
      wheel: "up",
      rawButton: 64,
      shift: false,
      meta: false,
      ctrl: false,
    },
    {
      type: "wheel",
      x: 9,
      y: 3,
      wheel: "down",
      rawButton: 65,
      shift: false,
      meta: false,
      ctrl: false,
    },
  ]);
}

{
  const parsed = parseSgrMousePackets("\u001b[<0;8;9M\u001b[<32;9;10M\u001b[<0;9;10m");

  assert.deepEqual(parsed.events, [
    {
      type: "press",
      x: 7,
      y: 8,
      button: "left",
      rawButton: 0,
      shift: false,
      meta: false,
      ctrl: false,
    },
    {
      type: "drag",
      x: 8,
      y: 9,
      button: "left",
      rawButton: 32,
      shift: false,
      meta: false,
      ctrl: false,
    },
    {
      type: "release",
      x: 8,
      y: 9,
      button: "left",
      rawButton: 0,
      shift: false,
      meta: false,
      ctrl: false,
    },
  ]);
}

{
  const parsed = parseSgrMousePackets("prefix\u001b[<4;1;1Mtail\u001b[<");

  assert.deepEqual(parsed.events, [
    {
      type: "press",
      x: 0,
      y: 0,
      button: "left",
      rawButton: 4,
      shift: true,
      meta: false,
      ctrl: false,
    },
  ]);
  assert.equal(parsed.rest, "\u001b[<");
}

{
  const parsed = parseSgrMousePackets("\u001b[<3;2;3M");

  assert.deepEqual(parsed.events, [
    {
      type: "release",
      x: 1,
      y: 2,
      button: "left",
      rawButton: 3,
      shift: false,
      meta: false,
      ctrl: false,
    },
  ]);
}

console.log("mouse tests passed");
