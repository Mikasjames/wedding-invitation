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
