import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import Module from "node:module";
import path from "node:path";

// Las pruebas no pueden abrir conexiones ni usar el fetch global.
const fail = () => { throw new Error("Red prohibida en pruebas de visión"); };
globalThis.fetch = fail;
net.Socket.prototype.connect = fail;
tls.connect = fail;
http.request = fail;
https.request = fail;
dgram.createSocket = fail;

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith("@/") ? path.join(process.env.VISION_TEST_OUTPUT, name.slice(2)) : name, ...args);
};
