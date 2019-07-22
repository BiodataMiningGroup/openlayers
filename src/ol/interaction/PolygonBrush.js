import {polygon as turfPolygon} from '@turf/helpers'
import GeometryType from '../geom/GeometryType.js';
import booleanOverlap from '@turf/boolean-overlap'
import Draw from './Draw.js';
import {DrawEvent} from './Draw.js';
import {DrawEventType} from './Draw.js';
import Circle from '../geom/Circle.js';
import Feature from '../Feature.js';
import Polygon from '../geom/Polygon.js'
import MapBrowserEventType from '../MapBrowserEventType.js';
import EventType from '../events/EventType.js';
import {shiftKeyOnly} from '../events/condition.js';
import {fromCircle} from '../geom/Polygon.js';
import {union} from '../geom/flat/union.js';
import {createEditingStyle} from '../style/Style.js';

class PolygonBrush extends Draw {

  constructor(options) {

    super(options);
    this.circleRadius_ = 10000;  //TODO better value
    this.mode_ = null;
    this.overlay_.setStyle(options.style ? options.style : getDefaultStyleFunction());
  }

  handleEvent(event) {
    const type = event.type;
    let pass = true;
    if (shiftKeyOnly(event) && (type === EventType.WHEEL || type === EventType.MOUSEWHEEL)) {
      this.updateSketchPointRadius_(event);
      pass = false;
    }

    if (event.type === MapBrowserEventType.POINTERDRAG && this.handlingDownUpSequence) {
      pass = false;
    }

    return super.handleEvent(event) && pass;
  }

  /**
   * @inheritDoc
   */
  handleDownEvent(event) {
    if (!this.handlingDownUpSequence) {
      this.startDrawing_(event);

      return true;
    }

    return false;
  }

  /**
   * @inheritDoc
   */
  handleUpEvent(event) {
    if (this.handlingDownUpSequence) {
      this.finishDrawing();

      return true;
    }

    return false;
  }

  /**
   * @param {import("../MapBrowserEvent.js").default} event Event.
   * @private
   */
  createOrUpdateSketchPoint_(event) {
    const coordinates = event.coordinate.slice();
    if (!this.sketchPoint_) {
      this.sketchPoint_ = new Feature(new Circle(coordinates, this.circleRadius_));
      this.updateSketchFeatures_();
    } else {
      const sketchPointGeom = this.sketchPoint_.getGeometry();
      sketchPointGeom.setCenter(coordinates);
    }
  }

  updateSketchPointRadius_(event) {
    if (this.sketchPoint_) {
      const sketchPointGeom = this.sketchPoint_.getGeometry();
      if (event.originalEvent.deltaY > 0) {
        this.circleRadius_ = sketchPointGeom.getRadius() + 1000;  //TODO better value
      }
      if (event.originalEvent.deltaY < 0) {
        this.circleRadius_ = sketchPointGeom.getRadius() - 1000;  //TODO better value
      }
      sketchPointGeom.setRadius(this.circleRadius_);
    }
  }

  startDrawing_(event) {
    const start = event.coordinate;
    this.finishCoordinate_ = start;

    this.sketchFeature_ = new Feature(fromCircle(this.sketchPoint_.getGeometry()));
    this.updateSketchFeatures_();
    this.dispatchEvent(new DrawEvent(DrawEventType.DRAWSTART, this.sketchFeature_));
  }

  /**
   * Stop drawing and add the sketch feature to the target layer.
   * The {@link module:ol/interaction/Draw~DrawEventType.DRAWEND} event is
   * dispatched before inserting the feature.
   * @api
   */
  handlePointerMove_(event) {
    this.createOrUpdateSketchPoint_(event);

    if (this.sketchFeature_) {
      const sketchPointGeometry = fromCircle(this.sketchPoint_.getGeometry());
      const sketchPointPolygon = turfPolygon(sketchPointGeometry.getCoordinates());
      const sketchFeatureGeometry = this.sketchFeature_.getGeometry();
      const sketchFeaturePolygon = turfPolygon(sketchFeatureGeometry.getCoordinates());
      if (booleanOverlap(sketchPointPolygon, sketchFeaturePolygon)) {
          var coords = union(sketchPointPolygon, sketchFeaturePolygon);
          sketchFeatureGeometry.setCoordinates(coords);
      }
    }
  }

  finishDrawing() {
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
