import { Triangle, Vector3, Vector2, Line3, Sphere, Plane } from 'three';
import { SeparatingAxisBounds } from './SeparatingAxisBounds.js';
import { closestPointsSegmentToSegment, sphereIntersectTriangle } from './MathUtilities.js';

const ZERO_EPSILON = 1e-15;
function isNearZero( value ) {

	return Math.abs( value ) < ZERO_EPSILON;

}

export class ExtendedTriangle extends Triangle {

	constructor( ...args ) {

		super( ...args );

		this.isExtendedTriangle = true;
		this.satAxes = new Array( 4 ).fill().map( () => new Vector3() );
		this.satBounds = new Array( 4 ).fill().map( () => new SeparatingAxisBounds() );
		this.points = [ this.a, this.b, this.c ];
		this.plane = new Plane();
		this.needsUpdate = true;

	}

	intersectsSphere( sphere ) {

		return sphereIntersectTriangle( sphere, this );

	}

	update() {

		const a = this.a;
		const b = this.b;
		const c = this.c;
		const points = this.points;

		const satAxes = this.satAxes;
		const satBounds = this.satBounds;

		const axis0 = satAxes[ 0 ];
		const sab0 = satBounds[ 0 ];
		this.getNormal( axis0 );
		sab0.setFromPoints( axis0, points );

		const axis1 = satAxes[ 1 ];
		const sab1 = satBounds[ 1 ];
		axis1.subVectors( a, b );
		sab1.setFromPoints( axis1, points );

		const axis2 = satAxes[ 2 ];
		const sab2 = satBounds[ 2 ];
		axis2.subVectors( b, c );
		sab2.setFromPoints( axis2, points );

		const axis3 = satAxes[ 3 ];
		const sab3 = satBounds[ 3 ];
		axis3.subVectors( c, a );
		sab3.setFromPoints( axis3, points );

		this.plane.setFromNormalAndCoplanarPoint( axis0, a );
		this.needsUpdate = false;

	}

}

ExtendedTriangle.prototype.closestPointToSegment = ( function () {

	const point1 = new Vector3();
	const point2 = new Vector3();
	const edge = new Line3();

	return function distanceToSegment( segment, target1 = null, target2 = null ) {

		const { start, end } = segment;
		const points = this.points;
		let distSq;
		let closestDistanceSq = Infinity;

		// check the triangle edges
		for ( let i = 0; i < 3; i ++ ) {

			const nexti = ( i + 1 ) % 3;
			edge.start.copy( points[ i ] );
			edge.end.copy( points[ nexti ] );

			closestPointsSegmentToSegment( edge, segment, point1, point2 );

			distSq = point1.distanceToSquared( point2 );
			if ( distSq < closestDistanceSq ) {

				closestDistanceSq = distSq;
				if ( target1 ) target1.copy( point1 );
				if ( target2 ) target2.copy( point2 );

			}

		}

		// check end points
		this.closestPointToPoint( start, point1 );
		distSq = start.distanceToSquared( point1 );
		if ( distSq < closestDistanceSq ) {

			closestDistanceSq = distSq;
			if ( target1 ) target1.copy( point1 );
			if ( target2 ) target2.copy( start );

		}

		this.closestPointToPoint( end, point1 );
		distSq = end.distanceToSquared( point1 );
		if ( distSq < closestDistanceSq ) {

			closestDistanceSq = distSq;
			if ( target1 ) target1.copy( point1 );
			if ( target2 ) target2.copy( end );

		}

		return Math.sqrt( closestDistanceSq );

	};

} )();

ExtendedTriangle.prototype.intersectsTriangle = ( function () {

	const saTri2 = new ExtendedTriangle();
	const arr1 = new Array( 3 );
	const arr2 = new Array( 3 );
	const cachedSatBounds = new SeparatingAxisBounds();
	const cachedSatBounds2 = new SeparatingAxisBounds();
	const cachedAxis = new Vector3();
	const dir = new Vector3();
	const dir1 = new Vector3();
	const dir2 = new Vector3();
	const tempDir = new Vector3();
	const edge = new Line3();
	const edge1 = new Line3();
	const edge2 = new Line3();
	const tempPoint = new Vector3();
	const bounds1 = new Vector2();
	const bounds2 = new Vector2();

	function coplanarIntersectsTriangle( self, other, target, suppressLog ) {

		// perform separating axis intersection test only for coplanar triangles
		const satBounds1 = self.satBounds;
		const satAxes1 = self.satAxes;
		for ( let i = 1; i < 4; i ++ ) {

			const sb = satBounds1[ i ];
			const sa = satAxes1[ i ];
			cachedSatBounds.setFromPoints( sa, other.points );
			if ( sb.isSeparated( cachedSatBounds ) ) return false;

			tempDir.copy( satAxes1[ 0 ] ).cross( sa );
			cachedSatBounds.setFromPoints( tempDir, self.points );
			cachedSatBounds2.setFromPoints( tempDir, other.points );
			if ( cachedSatBounds.isSeparated( cachedSatBounds2 ) ) return false;

		}

		const satBounds2 = other.satBounds;
		const satAxes2 = other.satAxes;
		for ( let i = 1; i < 4; i ++ ) {

			const sb = satBounds2[ i ];
			const sa = satAxes2[ i ];
			cachedSatBounds.setFromPoints( sa, self.points );
			if ( sb.isSeparated( cachedSatBounds ) ) return false;

			tempDir.copy( satAxes2[ 0 ] ).cross( sa );
			cachedSatBounds.setFromPoints( tempDir, self.points );
			cachedSatBounds2.setFromPoints( tempDir, other.points );
			if ( cachedSatBounds.isSeparated( cachedSatBounds2 ) ) return false;

		}

		if ( target ) {

			// TODO find two points that intersect on the edges and make that the result
			if ( ! suppressLog ) {

				// console.warn( 'ExtendedTriangle.intersectsTriangle: Triangles are coplanar which does not support an output edge. Setting edge to 0, 0, 0.' );

			}

			target.start.set( 0, 0, 0 );
			target.end.set( 0, 0, 0 );

		}

		return true;

	}

	function findSingleBounds( a, b, c, aProj, bProj, cProj, aDist, bDist, cDist, bounds, edge ) {

		let t = aDist / ( aDist - bDist );
		bounds.x = aProj + ( bProj - aProj ) * t;
		edge.start.subVectors( b, a ).multiplyScalar( t ).add( a );

		t = aDist / ( aDist - cDist );
		bounds.y = aProj + ( cProj - aProj ) * t;
		edge.end.subVectors( c, a ).multiplyScalar( t ).add( a );

	}

	function findBounds( self, aProj, bProj, cProj, abDist, acDist, aDist, bDist, cDist, bounds, edge ) {

		if ( abDist > 0 ) {

			// then bcDist < 0
			findSingleBounds( self.c, self.a, self.b, cProj, aProj, bProj, cDist, aDist, bDist, bounds, edge );

		} else if ( acDist > 0 ) {

			findSingleBounds( self.b, self.a, self.c, bProj, aProj, cProj, bDist, aDist, cDist, bounds, edge );

		} else if ( bDist * cDist > 0 || aDist != 0 ) {

			findSingleBounds( self.a, self.b, self.c, aProj, bProj, cProj, aDist, bDist, cDist, bounds, edge );

		} else if ( bDist != 0 ) {

			findSingleBounds( self.b, self.a, self.c, bProj, aProj, cProj, bDist, aDist, cDist, bounds, edge );

		} else if ( cDist != 0 ) {

			findSingleBounds( self.c, self.a, self.b, cProj, aProj, bProj, cDist, aDist, bDist, bounds, edge );

		} else {

			return true;

		}

		return false;

	}

	// TODO: If the triangles are coplanar and intersecting the target is nonsensical. It should at least
	// be a line contained by both triangles if not a different special case somehow represented in the return result.
	return function intersectsTriangle( other, target = null, suppressLog = false ) {

		if ( this.needsUpdate ) {

			this.update();

		}

		if ( ! other.isExtendedTriangle ) {

			saTri2.copy( other );
			saTri2.update();
			other = saTri2;

		} else if ( other.needsUpdate ) {

			other.update();

		}

		const plane1 = this.plane;
		const plane2 = other.plane;

		let a1Dist = plane2.distanceToPoint( this.a );
		let b1Dist = plane2.distanceToPoint( this.b );
		let c1Dist = plane2.distanceToPoint( this.c );

		if ( isNearZero( a1Dist ) )
			a1Dist = 0;

		if ( isNearZero( b1Dist ) )
			b1Dist = 0;

		if ( isNearZero( c1Dist ) )
			c1Dist = 0;

		const a1b1Dist = a1Dist * b1Dist;
		const a1c1Dist = a1Dist * c1Dist;
		if ( a1b1Dist > 0 && a1c1Dist > 0 ) {

			return false;

		}

		let a2Dist = plane1.distanceToPoint( other.a );
		let b2Dist = plane1.distanceToPoint( other.b );
		let c2Dist = plane1.distanceToPoint( other.c );

		if ( isNearZero( a2Dist ) )
			a2Dist = 0;

		if ( isNearZero( b2Dist ) )
			b2Dist = 0;

		if ( isNearZero( c2Dist ) )
			c2Dist = 0;

		const a2b2Dist = a2Dist * b2Dist;
		const a2c2Dist = a2Dist * c2Dist;
		if ( a2b2Dist > 0 && a2c2Dist > 0 ) {

			return false;

		}

		dir1.copy( plane1.normal );
		dir2.copy( plane2.normal );
		const intersectionLine = dir1.cross( dir2 );
		let componentIndex = 0;
		let maxComponent = Math.abs( intersectionLine.x );
		const comp1 = Math.abs( intersectionLine.y );
		if ( comp1 > maxComponent ) {

			maxComponent = comp1;
			componentIndex = 1;

		}

		const comp2 = Math.abs( intersectionLine.z );
		if ( comp2 > maxComponent ) {

			componentIndex = 2;

		}

		// One big switch should be better?
		let a1Proj, b1Proj, c1Proj;
		let a2Proj, b2Proj, c2Proj;
		switch ( componentIndex ) {

			case 0:
				a1Proj = this.a.x;
				b1Proj = this.b.x;
				c1Proj = this.c.x;

				a2Proj = other.a.x;
				b2Proj = other.b.x;
				c2Proj = other.c.x;
				break;

			case 1:
				a1Proj = this.a.y;
				b1Proj = this.b.y;
				c1Proj = this.c.y;

				a2Proj = other.a.y;
				b2Proj = other.b.y;
				c2Proj = other.c.y;
				break;

			case 2:
				a1Proj = this.a.z;
				b1Proj = this.b.z;
				c1Proj = this.c.z;

				a2Proj = other.a.z;
				b2Proj = other.b.z;
				c2Proj = other.c.z;
				break;

		}

		if ( findBounds( this, a1Proj, b1Proj, c1Proj, a1b1Dist, a1c1Dist, a1Dist, b1Dist, c1Dist, bounds1, edge1 ) ) {

			return coplanarIntersectsTriangle( this, other, target, suppressLog );

		}

		if ( findBounds( other, a2Proj, b2Proj, c2Proj, a2b2Dist, a2c2Dist, a2Dist, b2Dist, c2Dist, bounds2, edge2 ) ) {

			return coplanarIntersectsTriangle( this, other, target, suppressLog );

		}

		if ( bounds1.y < bounds1.x ) {

			const tmp = bounds1.y;
			bounds1.y = bounds1.x;
			bounds1.x = tmp;

			tempPoint.copy( edge1.start );
			edge1.start.copy( edge1.end );
			edge1.end.copy( tempPoint );

		}

		if ( bounds2.y < bounds2.x ) {

			const tmp = bounds2.y;
			bounds2.y = bounds2.x;
			bounds2.x = tmp;

			tempPoint.copy( edge2.start );
			edge2.start.copy( edge2.end );
			edge2.end.copy( tempPoint );

		}

		if ( bounds1.y < bounds2.x || bounds2.y < bounds1.x ) {

			return false;

		}

		if ( target ) {

			if ( bounds2.x > bounds1.x ) {

				target.start.copy( edge2.start );

			} else {

				target.start.copy( edge1.start );

			}

			if ( bounds2.y < bounds1.y ) {

				target.end.copy( edge2.end );

			} else {

				target.end.copy( edge1.end );

			}

		}

		return true;

	};

} )();


ExtendedTriangle.prototype.distanceToPoint = ( function () {

	const target = new Vector3();
	return function distanceToPoint( point ) {

		this.closestPointToPoint( point, target );
		return point.distanceTo( target );

	};

} )();


ExtendedTriangle.prototype.distanceToTriangle = ( function () {

	const point = new Vector3();
	const point2 = new Vector3();
	const cornerFields = [ 'a', 'b', 'c' ];
	const line1 = new Line3();
	const line2 = new Line3();

	return function distanceToTriangle( other, target1 = null, target2 = null ) {

		const lineTarget = target1 || target2 ? line1 : null;
		if ( this.intersectsTriangle( other, lineTarget ) ) {

			if ( target1 || target2 ) {

				if ( target1 ) lineTarget.getCenter( target1 );
				if ( target2 ) lineTarget.getCenter( target2 );

			}

			return 0;

		}

		let closestDistanceSq = Infinity;

		// check all point distances
		for ( let i = 0; i < 3; i ++ ) {

			let dist;
			const field = cornerFields[ i ];
			const otherVec = other[ field ];
			this.closestPointToPoint( otherVec, point );

			dist = otherVec.distanceToSquared( point );

			if ( dist < closestDistanceSq ) {

				closestDistanceSq = dist;
				if ( target1 ) target1.copy( point );
				if ( target2 ) target2.copy( otherVec );

			}


			const thisVec = this[ field ];
			other.closestPointToPoint( thisVec, point );

			dist = thisVec.distanceToSquared( point );

			if ( dist < closestDistanceSq ) {

				closestDistanceSq = dist;
				if ( target1 ) target1.copy( thisVec );
				if ( target2 ) target2.copy( point );

			}

		}

		for ( let i = 0; i < 3; i ++ ) {

			const f11 = cornerFields[ i ];
			const f12 = cornerFields[ ( i + 1 ) % 3 ];
			line1.set( this[ f11 ], this[ f12 ] );
			for ( let i2 = 0; i2 < 3; i2 ++ ) {

				const f21 = cornerFields[ i2 ];
				const f22 = cornerFields[ ( i2 + 1 ) % 3 ];
				line2.set( other[ f21 ], other[ f22 ] );

				closestPointsSegmentToSegment( line1, line2, point, point2 );

				const dist = point.distanceToSquared( point2 );
				if ( dist < closestDistanceSq ) {

					closestDistanceSq = dist;
					if ( target1 ) target1.copy( point );
					if ( target2 ) target2.copy( point2 );

				}

			}

		}

		return Math.sqrt( closestDistanceSq );

	};

} )();
