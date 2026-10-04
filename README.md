# Low Poly Car Builder

A desktop editor for blocky low-poly Roblox cars and their swappable parts, made for Bubblegum World.
It makes models only: no rigging, scripts or physics. The game adds the driving.

Every car is built from Roblox's own shapes (Block, Wedge, Corner wedge, Cylinder, Ball), so what you see
is exactly what Studio builds.

## What you can do

- **Start from your game's cars.** The 9 cars from the game open with every piece editable, left/right pairs
  linked so one side changes both. You can also start from 6 starter shapes, or open any car `.rbxm`.
- **Change parts with sliders.** Body, roof, glass, bumpers, skirts, spoiler, hood, lights, wheels, exhaust and
  13 extras (scoops, fins, light bars, racks and more) are made by generators. Each one has designs to pick
  (hover a design to preview it) and sliders that follow the car's length, width and wheelbase.
- **Edit shape by shape.** Double-click a part to edit its shapes. You can move, turn and size them with the gizmo
  or type the numbers (maths works, labels drag to scrub). You can also mirror to the other side, repeat in a
  row or ring, cut away like Negate, snap, align, drop onto the car, and group shapes into new parts.
- **Keep parts.** Linked copies change together. "Save to My parts" keeps any part for other cars, and
  generated parts resize to fit the next car.
- **Draw from pictures.** Reference images can sit in the side, front, back and top views.
- **Undo everything** (Ctrl+Z, 150 steps). The editor also autosaves and asks to restore on the next start.

## Export

Export writes any of these:

| File | What it is |
| --- | --- |
| `Car_Model.lua` | Studio command-bar script that builds the whole car as anchored parts and Unions (with `WorkshopRecipe`). |
| `Car_Drivable.lua` | Optional: the same shapes built through the game's `CarKit` / `CarBodyKit`, which adds the rig. |
| `Car_ShopParts.lua` / `.json` | Parts for `ReplicatedStorage.CustomParts`, in each slot's frame with this car's `ref` sizes, so the game fits them to every car. |
| `Car.fbx`, `Part.fbx` | The car, or each part, as meshes with cuts applied and vertex colours. |
| `Car_Settings.json` | Colours, aura, underglow, boost trail, headlight colour and window tint for the game to spawn. |
| `Car.lpcar` | The project, to open again later. |

Scale matches the game: the front faces -Z, the ground is y = 0, and 1 stud = 0.28 m.

## Light on the GPU

The view only redraws when something changes, asks for the low-power GPU, caps the pixel ratio at 1.5 and
the frame rate at 60 while dragging, and caches each part so editing one never rebuilds the others.

## Development

```sh
npm ci
npm run dev        # editor in the browser at http://localhost:5173
npm test           # tests (exports are run against a mock of the Roblox API and the game's own fit code)
npx tauri build    # Windows .exe (needs Rust); CI builds it on every push as the LowPolyCarBuilder-windows artifact
```

Code map: `src/core` (car model, shapes, generators, templates), `src/io` (.rbxm reader and import),
`src/render` (three.js view, cut preview), `src/app` (edits, undo, selection), `src/ui` (panels and dialogs),
`src/export` (Studio script, CustomParts, FBX).
