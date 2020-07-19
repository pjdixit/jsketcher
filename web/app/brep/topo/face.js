import {TopoObject} from './topo-object'
import {Loop} from './loop'
import PIP from '../../cad/tess/pip';
import {eqSqTol, veq, veqNeg} from "../geom/tolerance";
import {
  ENCLOSE_CLASSIFICATION, isCurveEntersEdgeAtPoint, isCurveEntersEnclose, isInsideEnclose,
  isOnPositiveHalfPlaneFromVec
} from "../operations/boolean";

export class Face extends TopoObject {

  constructor(surface) {
    super();
    this.surface = surface;
    this.shell = null;
    this.outerLoop = new Loop(this);
    this.innerLoops = [];
    this.defineIterable('loops', () => loopsGenerator(this));
    this.defineIterable('edges', () => halfEdgesGenerator(this));
    Object.defineProperty(this, "id", {
      get: () => this.data.id,
      set: (value) => this.data.id = value,
    });
  }

  createWorkingPolygon() {
    return [this.outerLoop, ...this.innerLoops].map(loop => loop.tess().map(pt => this.surface.workingPoint(pt)));
  }

  env2D() {
    if (this.__2d === undefined) {
      let workingPolygon = this.createWorkingPolygon();
      let [inner, ...outers] = workingPolygon;
      this.__2d = {
        pip: PIP(inner, outers),
        workingPolygon
      }
    }
    return this.__2d;
  }
  
  getAnyHalfEdge() {
    let e = this.outerLoop.halfEdges[0];
    if (!e && this.innerLoops[0]) {
      e = this.innerLoops[0].halfEdges[0];
    }
    return e;
  }
  
  getAnyVertex() {
    return this.getAnyHalfEdge().vertexA;
  }
  
  rayCast(pt, surface) {

    surface = surface || this.surface;
    
    for (let edge of this.edges) {
      if (veq(pt, edge.vertexA.point)) {
        return {
          inside: true,
          strictInside: false,
          vertex: edge.vertexA
        };
      }
    }

    for (let edge of this.edges) {
      if (edge.edge.curve.passesThrough(pt)) {
        return {
          inside: true,
          strictInside: false,
          edge
        }
      }
    }

    function closestPointToEdge(edge) {
      return edge.edge.curve.point(edge.edge.curve.param(pt));
    }
    
    let closest = null;    
    for (let edge of this.edges) {
      let closestPoint = closestPointToEdge(edge);
      let dist = pt.distanceToSquared(closestPoint);
      if (closest === null || dist < closest.dist) {
        closest = {dist, pt: closestPoint, edge};
      }
    }
    let enclose = null;
    function findEnclosure(vertex) {
      for (let e of closest.edge.loop.encloses) {
        if (e[2] === vertex) {
          return e;
        }
      }
    }
    if (veq(closest.pt, closest.edge.vertexA.point)) {
      enclose = [closest.edge.prev, closest.edge, closest.edge.vertexA];
    } else if (veq(closest.pt, closest.edge.vertexB.point)) {
      enclose = [closest.edge, closest.edge.next, closest.edge.vertexB];
    }

    let normal = surface.normal(closest.pt);
    let testee = (enclose ? enclose[2].point : closest.pt).minus(pt)._normalize();
    
    // __DEBUG__.AddSegment(pt, enclose ? enclose[2].point : closest.pt);
    
    let tangent;
    if (enclose !== null) {
      let [ea, eb] = enclose;
      tangent = ea.tangentAtEnd().plus(eb.tangentAtStart())._normalize();
    } else {
      tangent = closest.edge.tangent(closest.pt);
    }
    // __DEBUG__.AddNormal(closest.pt, tangent);

    let inside = !isOnPositiveHalfPlaneFromVec(tangent, testee, normal);
    return {
      inside,
      strictInside: inside,
    };
  }
}

export function* loopsGenerator(face) {
  if (face.outerLoop !== null) {
    yield face.outerLoop;
  }
  for (let innerLoop of face.innerLoops) {
    yield innerLoop;
  }
}

export function* halfEdgesGenerator(face) {
  for (let loop of face.loops) {
    for (let halfEdge of loop.halfEdges) {
      yield halfEdge;
    }
  }
}
