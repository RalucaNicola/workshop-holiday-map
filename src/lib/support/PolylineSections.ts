import {Polyline, SpatialReference} from "@arcgis/core/geometry";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import Point from "@arcgis/core/geometry/Point";

import lerp from "./interpolate";

export default class PolylineSections {
  private spatialReference: SpatialReference;

  private xs: number[] = [];
  private dxs: number[] = [];
  private points: number[][] = [];

  constructor(polyline: Polyline) {
    const coordinates = polyline.paths.length ? polyline.paths[0] : [];
    this.spatialReference = polyline.spatialReference;

    // Compute distances between given coordinates
    let prevPoint: Point | null = null;
    coordinates.forEach((coords, index) => {
      this.points.push(([] as number[]).concat(coords));
      const point = this.newPoint(coords);
      if (index === 0) {
        this.xs.push(0);
      } else {
        const distance = geometryEngine.distance(prevPoint as Point, point, undefined as any);
        this.dxs.push(distance);
        this.xs.push(distance + this.xs[index - 1]);
      }
      prevPoint = point;
    });
  }

  public createPolyline = (x: number): Polyline => {
    const xs = this.xs;
    const length = xs.length;
    const start = length ? xs[0] : 0;
    const end = length ? xs[length - 1] : 0;
    const xAbs = start + (end - start) * x;

    const spatialReference = this.spatialReference;
    const path: number[][] = [];

    if (2 <= length) {
      let i = 0;
      path.push(this.points[0]);
      while (i < xs.length - 1 && xAbs > xs[i + 1]) {
        i++;
        path.push(this.points[i]);
      }

      // Interpolate last point

      const dx = this.dxs[i];

      const p1 = this.points[i];
      const p2 = this.points[i + 1];

      path.push(lerp(p1, p2, xAbs - xs[i], dx) || []);
    }

    return new Polyline({
      paths: [path],
      spatialReference,
    });
  };

  private newPoint = (coords: number[]) => {
    const x = coords[0];
    const y = coords[1];
    const z = coords[2];
    return new Point({
      spatialReference: this.spatialReference,
      x,
      y,
      z,
    });
  };
}
