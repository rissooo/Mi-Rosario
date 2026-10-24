import assert from "node:assert/strict";
import test from "node:test";
import { isCrossSiteMutation } from "../lib/reports/same-origin";

const site = "https://mi-rosario.vercel.app";

test("acepta un POST con Origin del mismo sitio", () => {
  assert.equal(isCrossSiteMutation(new Headers({ origin: site }), site), false);
});

test("rechaza un POST con Origin de otro sitio o Origin null", () => {
  assert.equal(isCrossSiteMutation(new Headers({ origin: "https://otro.example" }), site), true);
  assert.equal(isCrossSiteMutation(new Headers({ origin: "null" }), site), true);
  assert.equal(isCrossSiteMutation(new Headers({ origin: "http://mi-rosario.vercel.app" }), site), true);
});

test("sin Origin decide por Sec-Fetch-Site", () => {
  assert.equal(isCrossSiteMutation(new Headers({ "sec-fetch-site": "cross-site" }), site), true);
  assert.equal(isCrossSiteMutation(new Headers({ "sec-fetch-site": "same-origin" }), site), false);
  assert.equal(isCrossSiteMutation(new Headers({ "sec-fetch-site": "none" }), site), false);
});

test("acepta un cliente sin Origin ni Sec-Fetch-Site", () => {
  assert.equal(isCrossSiteMutation(new Headers(), site), false);
});
