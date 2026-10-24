import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MULTIPART_BYTES } from "../lib/contracts/reports";
import { isMultipartContentLengthTooLarge } from "../lib/reports/request-size";

test("el límite temprano acepta el máximo multipart y rechaza el byte siguiente", () => {
  assert.equal(isMultipartContentLengthTooLarge(String(MAX_MULTIPART_BYTES)), false);
  assert.equal(isMultipartContentLengthTooLarge(String(MAX_MULTIPART_BYTES + 1)), true);
});

test("el límite temprano no interpreta longitudes ausentes o mal formadas como cargas grandes", () => {
  assert.equal(isMultipartContentLengthTooLarge(null), false);
  assert.equal(isMultipartContentLengthTooLarge(""), false);
  assert.equal(isMultipartContentLengthTooLarge("-1"), false);
  assert.equal(isMultipartContentLengthTooLarge("4 MiB"), false);
});
