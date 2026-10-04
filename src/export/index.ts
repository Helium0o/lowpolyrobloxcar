import { safeName, type Car } from '../core/types';
import { customParts, customPartsScript, exportableParts, type CustomPartResult, type ShopInfo } from './customparts';
import { carFbx, partFbx } from './fbxCar';
import { studioScript } from './studio';

// Everything one Export click can write. Each option maps to files with plain names.

export interface OutFile {
  name: string;
  data: Uint8Array;
}

export interface ExportOptions {
  /** Whole car as a Studio build script. */
  car: boolean;
  drivable: boolean;
  /** Ids of parts to send to the game's shop (CustomParts). */
  shopParts: string[];
  shop: ShopInfo;
  fbxCar: boolean;
  fbxParts: boolean;
  settings: boolean;
  project: boolean;
}

const enc = new TextEncoder();
const text = (name: string, s: string): OutFile => ({ name, data: enc.encode(s) });

export function settingsJson(car: Car): string {
  return JSON.stringify({ carName: car.game.carName || car.name, colors: car.colors, game: car.game, params: car.params }, null, 2);
}

export function buildExport(car: Car, o: ExportOptions): { files: OutFile[]; shop: CustomPartResult[] } {
  const base = safeName(car.name);
  const files: OutFile[] = [];
  let shop: CustomPartResult[] = [];
  if (o.car) files.push(text(`${base}_${o.drivable ? 'Drivable' : 'Model'}.lua`, studioScript(car, { drivable: o.drivable, parent: 'Workspace' })));
  if (o.shopParts.length) {
    const parts = exportableParts(car).filter((p) => o.shopParts.includes(p.id) || (p.link && o.shopParts.includes(p.link)));
    shop = customParts(car, parts, o.shop);
    if (shop.some((r) => r.data)) {
      files.push(text(`${base}_ShopParts.lua`, customPartsScript(shop)));
      files.push(text(`${base}_ShopParts.json`, JSON.stringify(Object.fromEntries(shop.filter((r) => r.data).map((r) => [r.id, r.data])), null, 1)));
    }
  }
  if (o.fbxCar) files.push({ name: `${base}.fbx`, data: carFbx(car) });
  if (o.fbxParts) for (const p of car.parts) {
    if (p.hidden || p.noExport) continue;
    const d = partFbx(car, p);
    if (d) files.push({ name: `${base}_${safeName(p.name)}.fbx`, data: d });
  }
  if (o.settings) files.push(text(`${base}_Settings.json`, settingsJson(car)));
  if (o.project) files.push(text(`${base}.lpcar`, JSON.stringify(car)));
  return { files, shop };
}
