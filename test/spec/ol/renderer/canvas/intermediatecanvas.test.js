import {create as createTransform, scale} from '../../../../../src/ol/transform.js';
import ImageLayer from '../../../../../src/ol/layer/Image.js';
import MapRenderer from '../../../../../src/ol/renderer/Map.js';
import IntermediateCanvasRenderer from '../../../../../src/ol/renderer/canvas/IntermediateCanvas.js';


describe('ol.renderer.canvas.IntermediateCanvas', function() {

  describe('#composeFrame()', function() {
    let renderer, frameState, layerState, context;
    beforeEach(function() {
      const layer = new ImageLayer({
        extent: [1, 2, 3, 4]
      });
      renderer = new IntermediateCanvasRenderer(layer);
      const image = new Image();
      image.width = 3;
      image.height = 3;
      renderer.getImage = function() {
        return image;
      };
      frameState = {
        viewState: {
          center: [2, 3],
          resolution: 1,
          rotation: 0
        },
        size: [10, 10],
        pixelRatio: 1,
        coordinateToPixelTransform: createTransform(),
        pixelToCoordinateTransform: createTransform()
      };
      renderer.getImageTransform = function() {
        return createTransform();
      };
      MapRenderer.prototype.calculateMatrices2D(frameState);
      layerState = layer.getLayerState();
      context = {
        save: sinon.spy(),
        restore: sinon.spy(),
        translate: sinon.spy(),
        rotate: sinon.spy(),
        beginPath: sinon.spy(),
        moveTo: sinon.spy(),
        lineTo: sinon.spy(),
        clip: sinon.spy(),
        drawImage: sinon.spy()
      };
    });

    it('clips to layer extent and draws image', function() {
      frameState.extent = [0, 1, 4, 5];

      renderer.composeFrame(frameState, layerState, context);
      expect(context.save.callCount).to.be(1);
      expect(context.translate.callCount).to.be(0);
      expect(context.rotate.callCount).to.be(0);
      expect(context.beginPath.callCount).to.be(1);
      expect(context.moveTo.firstCall.args).to.eql([4, 4]);
      expect(context.lineTo.firstCall.args).to.eql([6, 4]);
      expect(context.lineTo.secondCall.args).to.eql([6, 6]);
      expect(context.lineTo.thirdCall.args).to.eql([4, 6]);
      expect(context.clip.callCount).to.be(1);
      expect(context.drawImage.firstCall.args).to.eql(
        [renderer.getImage(), 0, 0, 3, 3, 0, 0, 3, 3]);
      expect(context.restore.callCount).to.be(1);
    });

    it('does not clip if frame extent does not intersect layer extent', function() {
      frameState.extent = [1.1, 2.1, 2.9, 3.9];

      renderer.composeFrame(frameState, layerState, context);
      expect(context.save.callCount).to.be(0);
      expect(context.translate.callCount).to.be(0);
      expect(context.rotate.callCount).to.be(0);
      expect(context.beginPath.callCount).to.be(0);
      expect(context.clip.callCount).to.be(0);
      expect(context.drawImage.firstCall.args).to.eql(
        [renderer.getImage(), 0, 0, 3, 3, 0, 0, 3, 3]);
      expect(context.restore.callCount).to.be(0);
    });

    it('does not clip if frame extent is outside of layer extent', function() {
      frameState.extent = [10, 20, 30, 40];

      renderer.composeFrame(frameState, layerState, context);
      expect(context.save.callCount).to.be(0);
      expect(context.translate.callCount).to.be(0);
      expect(context.rotate.callCount).to.be(0);
      expect(context.beginPath.callCount).to.be(0);
      expect(context.clip.callCount).to.be(0);
      expect(context.drawImage.firstCall.args).to.eql(
        [renderer.getImage(), 0, 0, 3, 3, 0, 0, 3, 3]);
      expect(context.restore.callCount).to.be(0);
    });

    it('does not draw image with width or height < 0.5', function() {
      frameState.extent = [10, 20, 30, 40];
      renderer.getImageTransform = function() {
        return scale(createTransform(), 0.1, 0.1);
      };

      renderer.composeFrame(frameState, layerState, context);

      expect(context.drawImage.notCalled).to.be(true);
    });

  });

});
