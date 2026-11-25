declare module 'polygon-clipping' {
  export type Position = [number, number];
  export type Ring = Position[];
  export type Polygon = Ring[];
  export type MultiPolygon = Polygon[];

  const polygonClipping: {
    union(geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>): MultiPolygon;
    difference(geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>): MultiPolygon;
    intersection(geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>): MultiPolygon;
    xor(geom: Polygon | MultiPolygon, ...geoms: Array<Polygon | MultiPolygon>): MultiPolygon;
  };

  export default polygonClipping;
}
