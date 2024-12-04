/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);
			const keywords = url.searchParams.get('keywords') || '';
			const cacheKeyParam = url.searchParams.get('cacheKey') || '';

			// Construct a unique cache key
			const cacheKey = `unsplash:${keywords}:${cacheKeyParam}`;

			// Try to get cached Unsplash API response from Workers KV
			let unsplashData: UnsplashApiResponse | null = await env.CACHE.get<UnsplashApiResponse>(cacheKey, { type: 'json' });

			if (!unsplashData) {
				// No cached data, fetch from Unsplash API
				const unsplashUrl = `https://api.unsplash.com/photos/random?orientation=landscape&query=${encodeURIComponent(keywords)}`;

				const unsplashResponse = await fetch(unsplashUrl, {
					headers: {
						Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`,
						'Accept-Version': 'v1',
					},
				});

				if (!unsplashResponse.ok) {
					return new Response('Error fetching image from Unsplash', { status: unsplashResponse.status });
				}

				unsplashData = await unsplashResponse.json<UnsplashApiResponse>();

				// Cache the API response in Workers KV with expiration
				const cacheDuration = env.CACHE_DURATION ? parseInt(env.CACHE_DURATION, 10) : 900; // Default to 900 seconds (15 minutes)
				await env.CACHE.put(cacheKey, JSON.stringify(unsplashData), { expirationTtl: cacheDuration });
			}

			// Get the image URL from the Unsplash data
			const imageUrl = `${unsplashData.urls.raw}&fm=webp&q=80&w=1920&fit=max`;

			// Fetch the image directly (not cached)
			const imageResponse = await fetch(imageUrl);

			if (!imageResponse.ok || !imageResponse.body) {
				return new Response('Error fetching image', { status: imageResponse.status });
			}

			// Get attribution information
			const photographerName = unsplashData.user.name;
			const photographerLink = unsplashData.user.links.html;
			const unsplashLink = unsplashData.links.html; // Link to the photo on Unsplash

			// Include attribution in headers
			const headers = new Headers(imageResponse.headers);
			headers.set('Content-Type', imageResponse.headers.get('Content-Type') || 'image/jpeg');
			headers.set('X-Attribution-Photographer', photographerName);
			headers.set('X-Attribution-Photographer-Link', photographerLink);
			headers.set('X-Attribution-Unsplash-Link', unsplashLink);

			return new Response(imageResponse.body, {
				status: imageResponse.status,
				statusText: imageResponse.statusText,
				headers: headers,
			});
		} catch (err) {
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

// Define interfaces for Unsplash API response
interface UnsplashApiResponse {
	urls: {
		raw: string;
		regular: string;
		[key: string]: string;
	};
	user: {
		name: string;
		links: {
			html: string;
			[key: string]: string;
		};
	};
	links: {
		html: string;
		[key: string]: string;
	};
	[key: string]: any;
}
