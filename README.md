# Low Poly Car Builder

A small Windows app for building low poly Roblox cars and swappable parts (bumpers, hoods,
spoilers, extras, lights, rims, tyres, exhausts) out of simple shapes, and exporting them as
`.fbx` for Roblox Studio.

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
| `<Part>.fbx` | One file per part (e.g. `Hood_Vented.fbx`, `WheelFL.fbx`). Meshes keep the part's mount point as pivot. Up to five meshes per part: paint (tintable), `_Tyre`, `_Trim` / `_Rim` (vertex coloured details), `_Glass`, `_Lights` (set these to Neon). |
| `<Car>.fbx` | Optional: the whole car, one group per part. |
| `<Car>_Settings.rbxmx` / `.json` | Settings the game reads: `RimStyle`, `RimFinish`, `ExhaustLayout`, `ExhaustShape`, `ExhaustFinish`, `WheelRadius`, `RoofHeight`, colours, `Aura`, `UnderglowEnabled`, `BoostTrail`, and effect attachments (`HeadLampL/R`, `RearLamp`, `Exhaust`, `TipFx`, `Underglow`, `Aura`). Positions are relative to the ground centre of the car, front facing -Z. |
| `<Car>_Recipes.json` | Each part as a `WorkshopRecipe` (adds and cuts of Blocks, Wedges, Cylinders and Balls). Shapes Roblox parts can't express exactly are marked `"approx": true`. |

Units are studs (1 unit = 1 stud) and Y is up. In Roblox Studio use **Import 3D**, keep
**Merge meshes** off, and check the first import against a 1-stud part to confirm the scale.

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
`src/export.ts` export files and the Roblox check, `src/viewport.ts` 3D view, `src/ui.ts`
panels, `src-tauri/` desktop shell.
