export default {
	multipass: true,
	plugins: [
		{
			name: 'preset-default',
			params: {
				overrides: {
					removeComments: false,
					removeViewBox: false,
					convertPathData: { floatPrecision: 0 },
					cleanupNumericValues: { floatPrecision: 0 }
				}
			}
		}
	]
};