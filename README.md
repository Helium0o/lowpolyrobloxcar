# Low Poly Car Builder

A small Windows app for building low poly Roblox cars and swappable parts (bumpers, hoods,
spoilers, extras, lights, rims, tyres, exhausts) out of simple shapes, and exporting them
straight into the game's `ReplicatedStorage.CustomParts` (with `.fbx` as an optional extra).

## Download

Every push builds the Windows app on GitHub Actions. Open the latest run of the **Build**
workflow, then download **LowPolyCarBuilder-windows** under Artifacts. It contains:

- `LowPolyCarBuilder.exe`: runs directly, no install.
- `Low Poly Car Builder_x.y.z_x64-setup.exe`: an installer (adds a Start menu entry).

Both use Windows' built-in WebView2 (already on Windows 10 and 11).

## Using it

- **Car tab**: pick a body, then a template for each slot. The slots follow the game's
  categories: Body kit, Extras, Lights, Paint & windows, Wheels, Exhaust & boost, Effects.
  Every part is generated from the body's measurements, so any part fits any body.
- **Click** a part to select it, click it again to edit one of its shapes. `G`/`R`/`S` move,
  rotate and scale; `M` mirrors left/right; `N` turns a shape into a hole (Negate);
  `Ctrl+D` duplicates; `Ctrl+Z`/`Ctrl+Y` undo and redo.
- **Add** shapes from the toolbar: box, wedge, corner wedge, chamfer box, tapered box,
  cylinder, half cylinder, cone, sphere, ring.
- **Save as my part** keeps a part in your own library; it shows up with a star in its slot.
- The triangle counter and **Roblox check** warn before anything goes over Roblox limits.

## Export

**Export for Roblox** asks for a folder and writes:

| File | What it is |
|---|---|
| `<Car>_CustomParts.lua` | **Main export.** Paste it into the Roblox Studio command bar (View > Command Bar) in edit mode and press Enter. It adds one `StringValue` per ticked part to `ReplicatedStorage.CustomParts` (replacing parts with the same id), updates the folder's `Count`, and adds an undo point. Play the game and the parts are in the Customs shop, fitted to every car. |
| `<Car>_CustomParts.json` | The same parts as `{"cp_<name>": "<StringValue text>"}`. |
| `<Car>_Settings.rbxmx` / `.json` | Settings the game reads: `RimStyle`, `RimFinish`, `ExhaustLayout`, `ExhaustShape`, `ExhaustFinish`, `WheelRadius`, `RoofHeight`, colours, `Aura`, `UnderglowEnabled`, `BoostTrail`, and effect attachments (`HeadLampL/R`, `RearLamp`, `Exhaust`, `TipFx`, `Underglow`, `Aura`). |
| `<Part>.fbx`, `<Car>.fbx` | Optional meshes: one file per part, or the whole car. |
| `<Car>_Recipes.json` | Optional: each part as a car-space `WorkshopRecipe` (adds and cuts). |

How parts map to the game's CustomParts format (`Kit.customFrames` / `Kit.fitRow` in `ShopCatalog`):

- Each part is written in its slot's frame with `ref` set to this car's measurements, so the game
  stretches it to each car. Game slot ids: `frontBumper`, `rearBumper`, `sideSkirts`, `spoiler`, `hood`,
  `headlights`, `taillights`, `hoodExtra`, `roofExtra`, `sideExtra`, `frontExtra`, `rearExtra`,
  `trunkExtra`, `exhaust` (a tip shape plus `layout`) and `rims` (rim frame, `ref = {W, T}`, `finish`).
- Side skirts and lamps store the left side only; the game mirrors the right side.
- Colours become game roles: body paint `paint`, black trim `black`, chrome `chrome`, headlight
  `head`, taillight `tail`, lamp glass `lens`; rims use `face` / `lip` / `barrel`, tips `body` / `lip` /
  `soot`. Accent, window tint and underglow colours are written as `custom` rows with their own colour.
- Shapes become Block, Wedge, Cylinder or Ball. Corner wedges, chamfered and tapered boxes, cones and
  half cylinders are approximated, and holes are left out (game parts have no cuts); the export
  dialog says which.
- The body, exhaust pipes and tyres stay the game car's own, so they only go out as FBX. A free-form
  part needs a **Game slot** (inspector) to export.
- Ids are `cp_<part name>`. Price, currency and level are set in the export dialog.

`tests/gameloader.ts` is a port of the game's loader maths; the tests place every exported template
part with it and check it lands where it was drawn.

FBX: units are studs and Y is up. In Roblox Studio use **Import 3D** and keep **Merge meshes** off.

## GPU use

The 3D view only draws when something changes (orbiting, editing, resizing), asks for the
low-power GPU, caps the pixel ratio at 1.5 and frames at 60 per second. Template thumbnails
are drawn once in the background and the renderer that drew them is then shut down. Effect
previews are still images, so nothing animates while the app is idle.

## Developing

```
npm install
npm run dev          # browser preview at http://localhost:5173
npm test             # geometry, templates and export tests
npx tauri dev        # desktop window (needs Rust)
npx tauri build      # Windows exe + installer (on Windows)
```

Code map: `src/model.ts` data model, `src/shapes.ts` shape geometry, `src/build.ts` part
meshes and cuts, `src/templates.ts` bodies and slot parts, `src/fbx.ts` binary FBX writer,
`src/customparts.ts` the game's CustomParts format, `src/export.ts` export files and the Roblox check, `src/viewport.ts` 3D view, `src/ui.ts`
panels, `src-tauri/` desktop shell.
