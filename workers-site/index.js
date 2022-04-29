import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
import { parse } from 'cookie'

import {
    twitterLoginUrl,
    twitterAuth,
    twitterMe,
    followingOnTwitter,
} from './twitter'

import {
    mastodonLoginUrl,
    mastodonAuth,
    mastodonMe,
    downloadFollowableCSV,
} from './mastodon'

import {
    addOrUpdateTwitterToMastodonMapping,
} from './user-matching'

/**
* The DEBUG flag will do two things that help during development:
* 1. we will skip caching on the edge, which makes it easier to
*    debug.
* 2. we will return an error message on exception in your Response rather
*    than the default 404.html page.
*/
const DEBUG = false

addEventListener('fetch', event => {
    event.respondWith(handleEvent(event))
})

async function handleEvent(event) {
    let options = {}
    
    /**
    * You can add custom logic to how we fetch your assets
    * by configuring the function `mapRequestToAsset`
    */
    // options.mapRequestToAsset = handlePrefix(/^\/docs/)
    
    try {
        const requestBody = event.request.body
        const requestedUrl = new URL(event.request.url)
        let {protocol, hostname, port, pathname, searchParams} = requestedUrl
        
        if (DEBUG) {
            protocol = 'http:'; hostname = '127.0.0.1'; port = '8787'
            
            // customize caching
            options.cacheControl = {
                bypassCache: true,
            }
        }
        
        const cookie = parse(event.request.headers.get('Cookie') || '')
        
        let response
        if (pathname === '/twitterLoginUrl') {
            response = await twitterLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
        } else if (pathname === '/mastodonLoginUrl') {
            response = await mastodonLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
        } else if (pathname === '/twitterAuth') {
            response = await twitterAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
        } else if (pathname === '/mastodonAuth') {
            response = await mastodonAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
        } else if (pathname === '/twitterMe') {
            const json = await twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
            response = new Response(JSON.stringify(json), {
                headers: {
                    'Content-type': 'application/json',
                },
            })
        } else if (pathname === '/mastodonMe') {
            const json = await mastodonMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
            response = new Response(JSON.stringify(json), {
                headers: {
                    'Content-type': 'application/json',
                },
            })
        } else if (pathname === '/addOrUpdateTwitterToMastodonMapping') {
            await addOrUpdateTwitterToMastodonMapping(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
            response = new Response(null, {status: 200})
        } else if (pathname === '/downloadFollowableCSV') {
            const body = await downloadFollowableCSV(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
            response = new Response(body, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="new_mastodon_follows.csv"',
                },
            })
        } else {
            const page = await getAssetFromKV(event, options)
            response = new Response(page.body, page)
        }
        
        response.headers.set('X-XSS-Protection', '1; mode=block')
        response.headers.set('X-Content-Type-Options', 'nosniff')
        response.headers.set('X-Frame-Options', 'DENY')
        response.headers.set('Referrer-Policy', 'unsafe-url')
        response.headers.set('Feature-Policy', 'none')
        
        return response
        
    } catch (e) {
        // if an error is thrown try to serve the asset at 404.html
        if (!DEBUG) {
            try {
                let notFoundResponse = await getAssetFromKV(event, {
                    mapRequestToAsset: req => new Request(`${new URL(req.url).origin}/404.html`, req),
                })
                
                return new Response(notFoundResponse.body, { ...notFoundResponse, status: 404 })
            } catch (e) {}
        }
        
        return new Response(e.message || e.toString(), { status: 500 })
    }
}

/**
* Here's one example of how to modify a request to
* remove a specific prefix, in this case `/docs` from
* the url. This can be useful if you are deploying to a
* route on a zone, or if you only want your static content
* to exist at a specific path.
*/
function handlePrefix(prefix) {
    return request => {
        // compute the default (e.g. / -> index.html)
        let defaultAssetKey = mapRequestToAsset(request)
        let url = new URL(defaultAssetKey.url)
        
        // strip the prefix from the path for lookup
        url.pathname = url.pathname.replace(prefix, '/')
        
        // inherit all other props from the default request
        return new Request(url.toString(), defaultAssetKey)
    }
}
