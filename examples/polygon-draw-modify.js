import Map from '../src/ol/Map.js';
import View from '../src/ol/View.js';
import PolygonAdd from '../src/ol/interaction/PolygonAdd.js'
import {Draw, Snap} from '../src/ol/interaction.js';
import {Tile as TileLayer, Vector as VectorLayer} from '../src/ol/layer.js';
import {OSM, Vector as VectorSource} from '../src/ol/source.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from '../src/ol/style.js';
import ModifyAdd from '../src/ol/interaction/ModifyAdd.js'
//import ModifySubtract from '../src/ol/interaction/ModifySubtract.js'
//import Modify from '../src/ol/interaction/Modify.js'

const raster = new TileLayer({
  source: new OSM()
});

const source = new VectorSource();
const vector = new VectorLayer({
  source: source,
  style: new Style({
    fill: new Fill({
      color: 'rgba(255, 255, 255, 0.2)'
    }),
    stroke: new Stroke({
      color: '#ffcc33',
      width: 2
    }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({
        color: '#ffcc33'
      })
    })
  })
});

const map = new Map({
  layers: [raster, vector],
  target: 'map',
  view: new View({
    center: [-11000000, 4600000],
    zoom: 4
  })
});

let modify;
//map.addInteraction(modify);

let draw, snap; // global so we can remove them later
const typeSelect = document.getElementById('type');

function addInteractions() {
  const value = typeSelect.value;
  if (value === 'Draw') {
    draw = new PolygonAdd({
      source: source,
      type: 'Point'
    });
    map.addInteraction(draw);
  }
  if (value === 'ModifyAdd') {
    modify = new ModifyAdd({source: source});
//    snap = new Snap({source: source});
//    map.addInteraction(snap);
    map.addInteraction(modify);
  }
  if (value === 'ModifySubtract') {
    //TODO another modify interaction
  }
}

/**
 * Handle change event.
 */
typeSelect.onchange = function() {
  map.removeInteraction(draw);
  map.removeInteraction(modify);
//  map.removeInteraction(snap);
  addInteractions();
};

addInteractions();
