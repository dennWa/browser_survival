// Kategorien + realistische Standardhöhen der Spielordner-Modelle (client/assets/eigene/*.glb).
// Von Hand gepflegt (Runde 19); `npm run eigene:index` schreibt `kategorie` und `zielHoehe` nach index.json.
// Kategorie-Schlüssel → Baukasten-Bereich (editor/kern/katalog.js MODELL_KATEGORIEN):
//   natur · tiere · bau · moebel · fahrzeuge · gegenstaende · essen · deko
// Neue Modelle: hier eintragen (Name ohne .glb). Fehlt ein Eintrag, gilt `deko`.

const L = (text) => text.trim().split(/\s+/);

export const KATEGORIEN = {
  natur: L(`
    bush bush-with-flowers clover clover-2 dead-tree dead-tree-2 dead-tree-3 dead-tree-4 dead-tree-5 fern
    flower-group flower-group-2 flower-petal flower-petal-2 flower-petal-3 flower-petal-4 flower-petal-5 flower-single flower-single-2
    grass grass-wispy grass-wispy-2 hedge mushroom mushroom-laetiporus
    pebble-round pebble-round-2 pebble-round-3 pebble-round-4 pebble-round-5
    pebble-square pebble-square-2 pebble-square-3 pebble-square-4 pebble-square-5 pebble-square-6
    pine pine-2 pine-3 pine-4 pine-b plant-big plant-big-2 rock-medium rock-medium-2 rock-medium-3 tall-grass tanne_schnee
    tree tree-2 tree-3 tree-4 tree-5 trees twisted-tree twisted-tree-2 twisted-tree-3 twisted-tree-4 twisted-tree-5 wood-log`),
  tiere: L(`
    alpaca apatosaurus bird bull cat chicken cow deer donkey duck fox german-shepard horse husky lis lowpoly-squirrel
    parasaurolophus penguin shiba-inu stag stegosaurus t-rex triceratops velociraptor white-horse wolf
    characters-matt characters-pug characters-sam characters-shaun zombie zombie-2 zombie-half`),
  bau: L(`
    arrow-sign barrier-single brick-wall brick-wall-2 bricks broken-window building building-l bus-stop bus-stop-sign
    cinder-block cinder-blocks container-green container-red corrugated-iron-sheet crane cross-walk dock door-double
    dumpster fence-long fire-hydrant floor-tile fountain gas-station house ladder mailbox market-stalls-compact metal-bars
    metal-fence metal-scaffold pipes pipes4-b plastic-barrier post rock-path-round-small rock-path-round-small-2
    rock-path-round-small-3 rock-path-round-thin rock-path-round-wide rock-path-square-smal rock-path-square-smal-2
    rock-path-square-smal-3 rock-path-square-thin rock-path-square-wide sandbox scaffolding seasaw shrine sign
    steampunk-pipes steel-beam steel-cable-anchor-point stone-wall stop-sign street-light street-light-b
    street-straight street-straight-crack street-straight-crack-2 street-t street-turn tent town-sign traffic-barrier
    traffic-barrier-2 traffic-cone traffic-cone-2 traffic-light traffic-light-b trash-container-open wall-doorway
    water-tower window wood-base-1 wood-base-2 wood-base-3 wood-base-4 wood-base-5 wood-base-6 wood-doorway-1
    wood-doorway-2 wood-fence-1 wood-fence-2 wood-fence-3 wood-fence-4 wood-fence-5 wood-floor-1 wood-floor-2
    wood-floor-3 wood-floor-4 wood-floor-5 wood-planks wood-stairs-1 wood-stairs-2 wood-tent-1 wood-tent-2
    wood-window-1 wood-window-2 wood-window-3 wooden-fence wooden-sign wooden-wall`),
  moebel: L(`
    bachelor-dresser bed-single bedside-lamp bench bunk-bed ceiling-lamp ceiling-lamp-2 ceiling-lamp-3 ceiling-lamp-4
    ceiling-lamp-5 chair closet club-arm-chair computer-desk cube-cabinet damaged-couch desk desk-lamp dish-washer
    double-bed double-door-base-cabinet double-door-tall-cabinet double-door-upper-cabin drawer drawers-base-cabinet
    drawers-double-door-bas executive-chair executive-desk fireplace floating-shelf floor-lamp fridge fridge-2 fridge-3
    garden-bench gas-stove kitchen-stool l-shaped-desk large-book-shelf large-wardrobe lingerie-dresser medium-book-shelf
    medium-wardrobe minimalist-modern-chair mirror modern-kitchen-table open-base-cabinet ottoman-coffe-table oven-solo
    park-bench rounded-coffee-table single-bed single-door-base-cabinet single-door-base-cabinet-2 single-door-tall-cabine
    single-door-upper-cabinet sink-kitchen-cabinet small-bookshelf small-wardrobe sofa sofa-small standing-desk
    steel-sink-kitchen-cabinet table table-1 table-2 table-7qaygzneryt table-big table-lamp three-seater-couch
    two-seater-couch vanity vending-machine wall-shelf wide-dresser wood-kitchen-chair wood-kitchen-table
    wooden-arm-chair wooden-chair wooden-kitchen-sink wool-carpet
    kenney-badschrank kenney-bildschirm kenney-buerostuhl kenney-dusche kenney-garderobe kenney-laptop kenney-muelleimer
    kenney-nachttisch kenney-spiegel kenney-toilette kenney-waschbecken kenney-waschmaschine`),
  fahrzeuge: L(`
    boat car car-2 dump-truck fire-truck forklift police-car raft raft-paddle sports-car sports-car-2 sushi-truck suv
    taxi tires truck-tank wheel wheels-stack`),
  gegenstaende: L(`
    angle-brush axe axe-1 axe2 backpack bag bag-open barbell barrel barrel-1 baseball-bat baseball-bat2 bass
    bass-speakers battery battery-2 bear-trap big-arm box box-b boxing-gloves cable-long cardboard-boxes
    cardboard-boxes-2 chest chest-2 colored-pencil compass crate crate-1 crate-2 crate-3 drum-set dry-erase-board
    dumbell eraser fan-brush filbert-brush first-aid-kit first-aid-kit-2 flare-gun flute gas-can glue guitar guitar2
    gymmat health knife knife2 knife3 light-stand link-chain match match-burnt matchbox monitor mouse notebook pallet
    pallet-broken pencil phone pickaxe-1 pistol propane-tank protein-powder punching-bag radio rifle round-brush
    scissors shotgun shovel shovel-b smg spear speakers toolbox torch torch-1 trash-bag trash-bags tv wash-brush
    wooden-bat-barbed wooden-bat-saw wooden-pallet wooden-torch`),
  essen: L(`
    air-fryer blender bottle bottle-2 bowl burger can can-broken can-red coffee-cup coffee-machine crate-lettuce
    crate-of-buns crate-of-carrots crate-of-potatoes crate-of-tomatoes crushed-soda-can donut fork fry-pan glass-cup
    ice-cream milkjar pan pizza plastic-cup plate pot pot-2 pot2 sauce-pan soda soda-can spoon tea-cup toaster water-bottle`),
  deko: L(`
    americanfootball-ball banner-wall basket-ball blood blood-splat blood-splat-2 bone bonfire candle-melted chalice
    debris-papers debris-papers-2 debris-pile eight-vases fire-pit-1 fire-pit-1-2 fire-pit-3 fish-bowl flag football
    fox-statue gem-blue gem-green gem-pink painting-canvas plant plant-2 planter--bushes tennis-ball volleyball-ball`),
};

/**
 * Realistische Standardhöhe in Metern (1 Kachel = 1 m), nur wo die Originalmaße offensichtlich nicht stimmen
 * (in cm exportiert, Spielzeuggröße …). Sonst gilt die gemessene Höhe (`masse.hoehe`).
 */
export const HOEHEN = {
  alpaca: 1.7, apatosaurus: 8, bull: 1.6, cat: 0.35, chicken: 0.45, cow: 1.5, deer: 1.4, donkey: 1.3, duck: 0.4,
  fox: 0.5, 'fox-statue': 1, horse: 1.7, 'white-horse': 1.7, husky: 0.6, 'shiba-inu': 0.4, 'german-shepard': 0.65,
  'lowpoly-squirrel': 0.3, lis: 0.5, parasaurolophus: 5, penguin: 0.7, stag: 1.6, stegosaurus: 4, 't-rex': 5,
  triceratops: 3, velociraptor: 1.6, wolf: 0.9, bird: 0.3,
  'baseball-bat': 0.9, 'baseball-bat2': 0.9, backpack: 0.5, 'bus-stop': 2.8, 'bus-stop-sign': 2.5, 'stop-sign': 2.4,
  'door-double': 2.2, closet: 2.1, 'bunk-bed': 1.8, guitar: 1, 'fire-truck': 3, raft: 0.5, 'truck-tank': 3.5,
  'dump-truck': 3.5, 'sushi-truck': 3.2, tent: 2.2, table: 0.75, desk: 0.75, bench: 0.5, 'soda-can': 0.12, soda: 0.3,
  'tennis-ball': 0.07, toolbox: 0.3, 'water-bottle': 0.3, bottle: 0.3, 'bottle-2': 0.3, burger: 0.12, 'gas-can': 0.4,
  'first-aid-kit': 0.2, 'first-aid-kit-2': 0.2, 'flare-gun': 0.2, knife2: 0.3, 'propane-tank': 1.2, radio: 0.3,
  phone: 0.15, matchbox: 0.05, match: 0.05, 'match-burnt': 0.05, scaffolding: 6, shovel: 1.3, 'ice-cream': 0.2,
  'eight-vases': 0.5, box: 0.6, building: 6, 'building-l': 8, 'twisted-tree': 8, 'twisted-tree-2': 8,
  'twisted-tree-3': 8, 'twisted-tree-4': 8, 'twisted-tree-5': 8, 'dead-tree': 7, 'dead-tree-2': 7, 'dead-tree-3': 7,
  'dead-tree-4': 7, 'dead-tree-5': 7, 'cardboard-boxes-2': 0.9, 'gas-station': 5, crane: 14, 'water-tower': 9,
  // Tutorial-Größen-Audit (2026-10-27): Ausreißer gegen die Spielerfigur (~1,8 m) geprüft
  chair: 0.95, 'bed-single': 0.75, 'single-bed': 1, 'vending-machine': 1.85, can: 0.15, 'can-red': 0.15, 'can-broken': 0.15,
  pot: 0.3, 'ceiling-lamp-3': 0.4, 'ceiling-lamp-4': 0.4, 'ceiling-lamp-5': 0.4, 'plant-big-2': 1.5, clover: 0.3, 'clover-2': 0.3,
  'flower-single': 0.5, 'flower-single-2': 0.5, 'flower-group': 0.6, 'flower-group-2': 0.6, fern: 0.9, axe2: 0.9, 'wood-log': 0.45,
  bonfire: 0.8, tv: 0.7, grass: 0.5,
  // Kenney Furniture Kit (CC0)
  'kenney-toilette': 0.8, 'kenney-waschbecken': 0.95, 'kenney-dusche': 2.1, 'kenney-spiegel': 0.7, 'kenney-muelleimer': 0.6,
  'kenney-garderobe': 1.8, 'kenney-buerostuhl': 1.0, 'kenney-nachttisch': 0.6, 'kenney-bildschirm': 0.45, 'kenney-laptop': 0.25,
  'kenney-badschrank': 0.9, 'kenney-waschmaschine': 0.9,
};

/** stem → Kategorie-Schlüssel */
export const kategorieVon = (() => {
  const karte = new Map();
  for (const [kat, liste] of Object.entries(KATEGORIEN)) for (const stem of liste) karte.set(stem, kat);
  return (stem) => karte.get(stem) ?? 'deko';
})();
