/**
 * @module ol/interaction/PolygonBrush
 */
import {polygon as turfPolygon} from '@turf/helpers';
import GeometryType from '../geom/GeometryType.js';
import booleanOverlap from '@turf/boolean-overlap';
import booleanContains from '@turf/boolean-contains';
import Draw from './Draw.js';
import {DrawEvent} from './Draw.js';
import {DrawEventType} from './Draw.js';
import Circle from '../geom/Circle.js';
import Feature from '../Feature.js';
import MapBrowserEventType from '../MapBrowserEventType.js';
import EventType from '../events/EventType.js';
import {shiftKeyOnly} from '../events/condition.js';
import {fromCircle} from '../geom/Polygon.js';
import {union} from '../geom/flat/union.js';
import {createEditingStyle} from '../style/Style.js';
import VectorLayer from '../layer/Vector.js';
import {always} from '../events/condition.js';

const MIN_BRUSH_SIZE = 5;
const BRUSH_RESIZE_STEP = 5;

/**
 * Return `true` if the event originates from a digital pen.
 *
 * In contrast to the condition from ../events/condition.js this function does not assert
 * that the event is a pointer event.
 *
 * @param {import("../MapBrowserEvent.js").default} mapBrowserEvent Map browser event.
 * @return {boolean} True if the event originates from a digital pen.
 * @api
 */
const penOnly = function(mapBrowserEvent) {
  const pointerEvt = mapBrowserEvent.pointerEvent;
  // see http://www.w3.org/TR/pointerevents/#widl-PointerEvent-pointerType
  return pointerEvt && pointerEvt.pointerType === 'pen';
};

export function getNewSketchPointRadius(event, radius) {
  let delta = event.originalEvent.deltaY;
  // Take the delta from deltaX if deltyY is 0 because some systems toggle the scroll
  // direction with certain keys pressed (e.g. Mac with Shift+Scroll).
  if (event.type == EventType.MOUSEWHEEL) {
    delta = -event.originalEvent.wheelDeltaY;
    if (delta === 0) {
      delta = -event.originalEvent.wheelDeltaX;
    }
  } else if (delta === 0) {
    delta = event.originalEvent.deltaX;
  }

  let step = BRUSH_RESIZE_STEP;
  if (radius <= (BRUSH_RESIZE_STEP * 5)) {
    step = 1;
  }

  if (delta > 0) {
    return radius + step;
  }

  if (delta < 0) {
    return Math.max(radius - step, MIN_BRUSH_SIZE);
  }

  return radius;
}

export function getNewSketchPointRadiusByPressure(event, radius) {
  if (event.pointerEvent.pressure != 0) {
    radius = getNewSketchPointRadius(event, radius);

    return Math.max(radius * event.pointerEvent.pressure, MIN_BRUSH_SIZE) *
      event.map.getView().getResolution();
  }

  return radius;
}

/**
 * @classdesc
 * Interaction for drawing polygons with a brush.
 *
 * @fires DrawEvent
 * @api
 */
class PolygonBrush extends Draw {

  constructor(options) {

    options.freehandCondition = options.freehandCondition ?
      options.freehandCondition : penOnly;

    super(options);

    // Override the default overlay to set updateWhileAnimating.
    this.overlay_ = new VectorLayer({
      source: this.overlay_.getSource(),
      style: options.style ? options.style : getDefaultStyleFunction(),
      updateWhileAnimating: true,
      updateWhileInteracting: true
    });

    this.sketchPointRadius_ = options.brushRadius !== undefined ?
      options.brushRadius : 100;
    this.condition_ = options.condition !== undefined ?
      options.condition : always;
    this.resizeCondition_ = options.resizeCondition !== undefined ?
      options.resizeCondition : shiftKeyOnly;

    this.isDrawing_ = false;
    this.sketchCircle_ = null;
  }

  setMap(map) {
    super.setMap(map);
    if (map) {
      let view = map.getView();
      if (view) {
        this.watchViewForChangedResolution(view);
      }

      map.on('change:view', (function (e) {
        this.watchViewForChangedResolution(e.target.getView());
      }).bind(this));
    }
  }

  watchViewForChangedResolution(view) {
    view.on('change:resolution', this.updateRelativeSketchPointRadius_.bind(this));
  }

  handleEvent(event) {
    const type = event.type;
    let pass = true;
    if (this.resizeCondition_(event) &&
      (type === EventType.WHEEL || EventType.MOUSEWHEEL)) {
      this.updateAbsoluteSketchPointRadius_(event);
      pass = false;
    }

    if (event.type === MapBrowserEventType.POINTERDRAG && this.handlingDownUpSequence) {
      pass = false;
    }

    return super.handleEvent(event) && pass;
  }

  handleDownEvent(event) {
    if (!this.handlingDownUpSequence) {
      if (this.condition_(event)) {
        this.startDrawing_(event);

        return true;
      }
    }

    return false;
  }

  handleUpEvent(event) {
    if (this.handlingDownUpSequence && this.isDrawing_) {
      this.finishDrawing();

      return true;
    }

    return false;
  }

  createOrUpdateSketchPoint_(event) {
    const coordinates = event.coordinate.slice();
    if (!this.sketchPoint_) {
      let relativeRadius = event.map.getView().getResolution() * this.sketchPointRadius_;
      this.sketchPoint_ = new Feature(new Circle(coordinates, relativeRadius));
      this.updateSketchFeatures_();
    } else {
      const sketchPointGeom = this.sketchPoint_.getGeometry();
      sketchPointGeom.setCenter(coordinates);
    }
  }

  updateRelativeSketchPointRadius_(event) {
    if (this.sketchPoint_) {
      this.sketchPoint_.getGeometry().setRadius(
        this.sketchPointRadius_ * event.target.getResolution()
      );
    }
  }

  updateAbsoluteSketchPointRadius_(event) {
    if (this.sketchPoint_) {
      this.sketchPointRadius_ = getNewSketchPointRadius(event, this.sketchPointRadius_);
      this.sketchPoint_.getGeometry().setRadius(
        this.sketchPointRadius_ * event.map.getView().getResolution()
      );
    }
  }

  createOrUpdateSketchCircle_(event) {
    const coordinates = event.coordinate.slice();
    if (!this.sketchCircle_) {
      this.sketchCircle_ = new Circle(coordinates, this.sketchPoint_.getGeometry().getRadius());
    } else {
      this.sketchCircle_.setCenter(coordinates);
      this.sketchCircle_.setRadius(this.sketchPoint_.getGeometry().getRadius())
    }

    if (event.originalEvent.pointerType === 'pen') {
      this.sketchCircle_.setRadius(
        getNewSketchPointRadiusByPressure(event, this.sketchPointRadius_)
      );
    }
  }

  startDrawing_(event) {
    this.isDrawing_ = true;
    this.createOrUpdateSketchPoint_(event);
    this.createOrUpdateSketchCircle_(event);
    const start = event.coordinate;
    this.finishCoordinate_ = start;
    this.sketchFeature_ = new Feature(fromCircle(this.sketchCircle_));
    this.updateSketchFeatures_();
    this.dispatchEvent(new DrawEvent(DrawEventType.DRAWSTART, this.sketchFeature_));
  }

  handlePointerMove_(event) {
    this.createOrUpdateSketchPoint_(event);
    this.createOrUpdateSketchCircle_(event);

    if (this.isDrawing_ && this.sketchFeature_) {
      const sketchCircleGeometry = fromCircle(this.sketchCircle_);
      const sketchCirclePolygon = turfPolygon(sketchCircleGeometry.getCoordinates());
      const sketchFeatureGeometry = this.sketchFeature_.getGeometry();
      const sketchFeaturePolygon = turfPolygon(sketchFeatureGeometry.getCoordinates());
      if (booleanOverlap(sketchCirclePolygon, sketchFeaturePolygon)
           || booleanContains(sketchCirclePolygon, sketchFeaturePolygon)) {
          sketchFeatureGeometry.setCoordinates(
            union(sketchCirclePolygon, sketchFeaturePolygon)
          );
      }
    }
  }

  finishDrawing() {
    this.isDrawing_ = false;
    const sketchFeature = this.abortDrawing_();
    if (!sketchFeature) {
      return;
    }

    this.dispatchEvent(new DrawEvent(DrawEventType.DRAWEND, sketchFeature));
    if (this.features_) {
      this.features_.push(sketchFeature);
    }
    if (this.source_) {
      this.source_.addFeature(sketchFeature);
    }
  }

  getBrushRadius() {
    return this.sketchPointRadius_;
  }

  abortDrawing_() {
    this.sketchCircle_ = null;

    return super.abortDrawing_();
  }
}

function getDefaultStyleFunction() {
  let styles = createEditingStyle();
  styles[GeometryType.POLYGON] =
      styles[GeometryType.POLYGON].concat(
        styles[GeometryType.LINE_STRING]
      );

  return function(feature, resolution) {
    return styles[feature.getGeometry().getType()];
  };
}

export default PolygonBrush;
