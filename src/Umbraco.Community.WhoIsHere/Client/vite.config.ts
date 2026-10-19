import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		lib: {
			entry: 'src/bundle.manifests.ts',
			formats: ['es'],
			fileName: 'whoishere',
		},
		outDir: '../wwwroot/App_Plugins/WhoIsHere',
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			// Provided by the backoffice at runtime through its import map
			external: [/^@umbraco-cms/],
		},
	},
});
