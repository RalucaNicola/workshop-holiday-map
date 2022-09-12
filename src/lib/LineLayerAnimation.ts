import Accessor from "@arcgis/core/core/Accessor";
import {property, subclass} from "@arcgis/core/core/accessorSupport/decorators";
import * as promiseUtils from "@arcgis/core/core/promiseUtils";
import Polyline from "@arcgis/core/geometry/Polyline";
import Graphic from "@arcgis/core/Graphic";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import Field from "@arcgis/core/layers/support/Field";
import * as jsonUtils from "@arcgis/core/renderers/support/jsonUtils";

import PolylineSections from "./support/PolylineSections";

type SourceLayerType = FeatureLayer | GeoJSONLayer;

const LINE_OBJECT_ID_FIELD = "_line_objectid";

const createAnimationLayer = (layer: FeatureLayer) => {
  let renderer = layer.renderer;
  if (renderer) {
    renderer = jsonUtils.fromJSON(renderer.toJSON());
  }

  let elevationInfo: any = layer.elevationInfo;

  // Try to invoke internal clone()
  if (elevationInfo && typeof elevationInfo.clone === "function") {
    elevationInfo = elevationInfo.clone();
  }

  const fields = [
    new Field({
      name: "OBJECTID",
      type: "oid",
    }),
    new Field({
      name: LINE_OBJECT_ID_FIELD,
      type: "long",
    }),
  ];

  layer.fields.forEach(field => {
    if (field.type !== "oid" && field.name !== "OBJECTID" && field.name !== LINE_OBJECT_ID_FIELD) {
      fields.push(field);
    }
  });

  return new FeatureLayer({
    fields,
    geometryType: "polyline",
    labelingInfo: layer.labelingInfo ? layer.labelingInfo.map(info => info.clone()) : (undefined as any),
    labelsVisible: layer.labelsVisible,
    legendEnabled: layer.legendEnabled,
    listMode: layer.listMode,
    maxScale: layer.maxScale,
    minScale: layer.maxScale,
    objectIdField: "OBJECTID",
    opacity: layer.opacity,
    outFields: ["*"],
    popupEnabled: layer.popupEnabled,
    popupTemplate: layer.popupTemplate ? layer.popupTemplate.clone() : (undefined as any),
    renderer,
    source: [],
    spatialReference: layer.spatialReference,
    title: layer.title,
  });
};

@subclass("animations.layers.LineLayerAnimation")
class LineLayerAnimation extends Accessor {
  @property()
  get sourceLayer(): SourceLayerType {
    return this._get<SourceLayerType>("sourceLayer");
  }
  set sourceLayer(layer: SourceLayerType) {
    const oldLayer = this._get("sourceLayer");
    if (oldLayer) {
      if (oldLayer === layer) {
        return;
      }
      throw new Error("The `sourceLayer` property cannot be changed once a layer has been assigned");
    }

    if (layer) {
      this._set("sourceLayer", layer);
      this.initializeAnimationLayer();
    }
  }

  private resolveAnimationLayer: (animationLayer: FeatureLayer) => any = null as any;
  private rejectAnimationLayer: (error: any) => any = null as any;

  private animationLayerPromise: Promise<FeatureLayer> = new Promise((resolve, reject) => {
    this.resolveAnimationLayer = resolve;
    this.rejectAnimationLayer = reject;
  });

  private animationGraphics = new Map<number, Graphic>();

  private sections = new Map<number, PolylineSections>();

  private seekGraphicDebounce = promiseUtils.debounce((progress: number, objectId: number) =>
    this.seekGraphicSequencial(progress, objectId)
  );

  public getLineGraphic(animatedGraphic: Graphic): Promise<Graphic> {
    const objectId = animatedGraphic.attributes[LINE_OBJECT_ID_FIELD];
    return this.queryLineGraphic(objectId);
  }

  public whenAnimatedLayer(): Promise<FeatureLayer> {
    return this.animationLayerPromise;
  }

  public seek(progress: number, objectId: number): Promise<any> {
    return this.seekGraphicDebounce(progress, objectId);
  }

  private seekGraphicSequencial(progress: number, objectId: number): Promise<any> {
    return this.getAnimationGraphic(objectId).then(graphic => {
      const edits: {
        addFeatures: Graphic[];
        updateFeatures: Graphic[];
      } = {
        addFeatures: [],
        updateFeatures: [],
      };

      let sections = this.sections.get(objectId);
      if (sections) {
        edits.updateFeatures = [graphic];
      } else {
        sections = new PolylineSections(graphic.geometry as Polyline);
        this.sections.set(objectId, sections);
        edits.addFeatures = [graphic];
      }

      const geometry = sections.createPolyline(progress);
      graphic.geometry = geometry;
      return this.whenAnimatedLayer().then(layer => {
        layer.applyEdits(edits);
      });
    });
  }

  private queryLineGraphic = (objectId: number): Promise<Graphic> => {
    const layer = this.sourceLayer;
    if (!layer) {
      return Promise.reject("No source layer assigned");
    }

    return layer
      .queryFeatures({
        objectIds: [objectId],
        outFields: ["*"],
        returnGeometry: true,
      })
      .then((featureSet): Graphic => {
        if (featureSet.features.length) {
          return featureSet.features[0];
        }
        throw new Error("No such graphic with objectId `{objectId}`");
      });
  };

  private getAnimationGraphic = (objectId: number): Promise<Graphic> => {
    if (this.animationGraphics.has(objectId)) {
      const graphic = this.animationGraphics.get(objectId) as Graphic;
      return Promise.resolve(graphic);
    } else {
      return this.queryLineGraphic(objectId)
        .then(lineGraphic => lineGraphic.clone())
        .then(animationGraphic => {
          const lineObjectId = animationGraphic.attributes[this.sourceLayer.objectIdField];
          animationGraphic.attributes[LINE_OBJECT_ID_FIELD] = lineObjectId;
          this.animationGraphics.set(objectId, animationGraphic);
          return animationGraphic;
        });
    }
  };

  private initializeAnimationLayer = (): Promise<any> => {
    return this.sourceLayer.load().then(layer => {
      if (layer.geometryType !== "polyline") {
        const error = new Error('`lineLayer` must have `geometryType` "polyline"');
        this.rejectAnimationLayer(error);
        throw error;
      }

      const animationLayer = createAnimationLayer(layer);
      this.resolveAnimationLayer(animationLayer);
    });
  };
}

export default LineLayerAnimation;
