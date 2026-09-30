// svgo 4 moved removeViewBox out of preset-default, so it cannot be overridden
// there and does not need to be — the viewBox is never at risk from it. The
// comment override is the load-bearing one: removeComments is in the preset and
// would strip the provenance note explaining the single-ink rewrite.
export default {
	multipass: true,
	plugins: [
		{
			name: 'preset-default',
			params: {
				overrides: {
					removeComments: false,
					convertPathData: { floatPrecision: 2 },
					cleanupNumericValues: { floatPrecision: 2 }
				}
			}
		}
	]
};
