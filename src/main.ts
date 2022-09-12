import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import {SimpleRenderer} from "@arcgis/core/renderers";
import {SimpleLineSymbol, SimpleMarkerSymbol, TextSymbol} from "@arcgis/core/symbols";
import MapView from "@arcgis/core/views/MapView";
import WebMap from "@arcgis/core/WebMap";
import LineLayerAnimation from "./lib/LineLayerAnimation";

const map = new WebMap({
  portalItem: {
    id: "02bae9c8de294eabaa91972b14394ecc",
  },
});

const view = new MapView({
  container: "viewDiv",
  map,
  ui: {
    components: [],
  },
  navigation: {
    browserTouchPanEnabled: false,
    mouseWheelZoomEnabled: false,
  },
});

const pois = new GeoJSONLayer({
  url: "./data/points.geojson",
  renderer: new SimpleRenderer({
    symbol: new SimpleMarkerSymbol({
      color: [255, 165, 0, 1],
      size: 8,
      style: "circle",
      outline: {
        width: 8,
        color: [255, 165, 0, 0.3],
      },
    }),
  }),
  labelingInfo: [
    new LabelClass({
      labelExpressionInfo: {expression: "$feature.name"},
      labelPlacement: "center-right",
      symbol: new TextSymbol({
        color: [255, 165, 0, 1],
        haloSize: 2,
        haloColor: [255, 255, 255, 1],
        font: {
          size: 10,
        },
      }),
    }),
  ],
});

map.add(pois);

const filterFeatures = (filter: string) => {
  pois.featureEffect = new FeatureEffect({
    filter: new FeatureFilter({
      where: filter,
    }),
    excludedEffect: "grayscale(100%) opacity(30%)",
  });
};

const setSection = (section: string | null) => {
  if (section) {
    filterFeatures(`id = '${section}'`);
    const bookmark = map.bookmarks.filter(b => b.name === section).getItemAt(0);
    if (bookmark) {
      view.goTo(bookmark.viewpoint, {duration: 1500});
    }
  }
};

const tracksLayer = new GeoJSONLayer({
  url: "./data/tracks.geojson",
  renderer: new SimpleRenderer({
    symbol: new SimpleLineSymbol({
      width: 3,
      color: [252, 169, 3],
      style: "solid",
      cap: "round",
      join: "round",
    }),
  }),
});

const tracks = {};
tracksLayer.queryFeatures({where: `1=1`, outFields: ["*"]}).then(result => {
  result.features.forEach(feature => {
    tracks[feature.attributes.id] = feature.attributes["__OBJECTID"];
  });
});

const animation = new LineLayerAnimation({
  sourceLayer: tracksLayer,
});

animation.whenAnimatedLayer().then(animatedLayer => {
  map.add(animatedLayer);
});

let currentSectionId: null | string = null;
let previousSectionId: null | string = null;
const sectionsList = document.querySelectorAll("section");
const sectionsArray = Array.from(sectionsList);

function getScrollProgress(element: HTMLElement) {
  const elemRect = element.getBoundingClientRect();

  const top = elemRect.top;
  // map is covering up 30% of the window height
  const windowHeight = 0.65 * window.innerHeight || document.documentElement.clientHeight;

  const progress = Math.min(Math.max(windowHeight - top, 0.01), elemRect.height);
  return progress / elemRect.height;
}

const animateTrack = (routeObjectId: number) => {
  if (typeof routeObjectId !== "undefined" && currentSectionId) {
    const scrollProgress = getScrollProgress(document.getElementById(currentSectionId) as HTMLElement);
    animation.seek(scrollProgress, routeObjectId);
  }
};

const update = () => {
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;

  sectionsArray.forEach(section => {
    const sectionRect = section.getBoundingClientRect();
    const top = sectionRect.top;
    const percentageTop = top / windowHeight;
    if (percentageTop < 0.7) {
      currentSectionId = section.id;
    }
  });

  if (currentSectionId !== previousSectionId) {
    previousSectionId = currentSectionId;
    setSection(currentSectionId);
  } else {
    if (currentSectionId && tracks[currentSectionId]) {
      animateTrack(tracks[currentSectionId]);
    }
  }
};

window.onscroll = update;
window.onload = update;
window.onresize = update;
