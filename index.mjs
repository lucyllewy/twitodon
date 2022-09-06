import path from 'path'
import { fileURLToPath } from 'url';

import Fastify from 'fastify'
import mongodb from '@fastify/mongodb'
import cookie from '@fastify/cookie'
import servestatic from '@fastify/static'

import {
    twitterLoginUrl,
    twitterAuth,
    twitterMe,
    followingOnTwitter,
} from './api/twitter.mjs'

import {
    mastodonLoginUrl,
    mastodonAuth,
    mastodonMe,
} from './api/mastodon.mjs'

import {
    addOrUpdateTwitterToMastodonMapping,
    matchTwitterUserToMastodon,
} from './api/user-matching.mjs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
    logger: false
})

app.register(mongodb, {
  // force to close the mongodb connection when app stopped
  // the default value is false
  forceClose: true,
  url: process.env.MongoUrl,
})

app.register(cookie, {
    secret: process.env.CookieSecret,
    parseOptions: {
        maxAge: 3600,
        sameSite: 'strict',
        // secure: true,
    }
})

app.register(servestatic, {
    root: path.join(__dirname, 'public'),
})

app.get('/twitterLoginUrl', twitterLoginUrl)
app.get('/twitterAuth', twitterAuth)
app.get('/twitterMe', twitterMe)
app.get('/mastodonLoginUrl', mastodonLoginUrl)
app.get('/mastodonAuth', mastodonAuth)
app.get('/mastodonMe', mastodonMe)
app.get('/followingOnTwitter', followingOnTwitter)
app.get('/addOrUpdateTwitterToMastodonMapping', addOrUpdateTwitterToMastodonMapping)
app.post('/matchTwitterUserToMastodon', matchTwitterUserToMastodon)

app.listen({ port: process.env.PORT ?? 3000 }, function (err, address) {
    if (err) {
        app.log.error(err)
        process.exit(1)
    }
    // Server is now listening on ${address}
})
