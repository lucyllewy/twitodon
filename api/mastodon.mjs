import fetch from 'node-fetch'

export const mastodonHostCookieName = 'mastodonHost',
            mastodonTokenCookieName = 'mastodonToken',
            scopes = 'read:accounts' // read:follows write:follows

/**
 * @param {string} mastodonDomain
 * @returns Promise<{_id: string, client_id: string, client_secret: string}>
 */
function getMastodonApp(mastodonDomain) {
    return this.mongo.db.collection('mastodon_apps').findOne({_id: mastodonDomain})
}

/**
 * @param {string} mastodonHost
 * @param {string} mastodonDomain
 * @param {string} redirectUri
 * @returns Promise<string>
 */
async function createMastodonApp(mastodonHost, mastodonDomain, redirectUri) {
    const response = await fetch(`${mastodonHost}/api/v1/apps`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'client_name=twitodon' +
            `&redirect_uris=${encodeURIComponent(redirectUri)}` +
            `&scopes=${encodeURIComponent(scopes)}`
    })

    if (response.status !== 200) {
        throw new Error('Mastodon API Error')
    }

    const {client_id, client_secret} = await response.json()

    await this.mongo.db.collection('mastodon_apps').insertOne({
        _id: mastodonDomain,
        client_id,
        client_secret,
    })

    return client_id
}

/**
 * @param {string} mastodonHost
 * @param {string} mastodonDomain
 * @param {string} redirectUri
 * @returns Promise<string>
 */
async function getOrCreateMastodonApp(mastodonHost, mastodonDomain, redirectUri) {
    const app = await getMastodonApp.call(this, mastodonDomain)
    if (app) {
        return app.client_id
    }

    return createMastodonApp.call(this, mastodonHost, mastodonDomain, redirectUri)
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns void
 */
export async function mastodonLoginUrl(request, reply) {
    const mastodonHost = new URL(request.query.mastodonHost)
    const mastodonDomain = (new URL(mastodonHost)).hostname
    const redirectUri = new URL(`${request.protocol}://${request.hostname}/mastodonAuth`)

    const client_id = await getOrCreateMastodonApp.call(this, mastodonHost.href, mastodonDomain, redirectUri.href)

    reply
        .setCookie(mastodonHostCookieName, mastodonHost.href, {
            maxAge: 3600,
            signed: true,
            sameSite: 'lax',
        })
        .send({
            mastodonLoginUrl: `${mastodonHost.href}/oauth/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirectUri.href)}&scope=${scopes}`
        })
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns void
 */
export async function mastodonAuth(request, reply) {
    const mastodonHost = request.unsignCookie(request.cookies[mastodonHostCookieName])
    if (!mastodonHost.valid) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const mastodonDomain = (new URL(mastodonHost.value)).hostname
    const redirectUri = new URL(`${request.protocol}://${request.hostname}/mastodonAuth`)

    const {client_id, client_secret} = await getMastodonApp.call(this, mastodonDomain)

    if (!client_id || !client_secret) {
        throw new Error('Where are my credentials?!')
    }

    const body = `code=${encodeURIComponent(request.query.code)}` +
                `&grant_type=${encodeURIComponent('authorization_code')}` +
                `&client_id=${encodeURIComponent(client_id)}` +
                `&client_secret=${encodeURIComponent(client_secret)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri.href)}` +
                `&scope=${encodeURIComponent(scopes)}`

    const oauthData = await fetch(`${mastodonHost.value}/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    })

    if (oauthData.status !== 200) {
        return reply.status(oauthData.status).clearCookie(mastodonTokenCookieName).send()
    }

    const json = await oauthData.json()

    reply
        .setCookie(mastodonTokenCookieName, json.access_token, {
            maxAge: 3600,
            signed: true,
            sameSite: 'strict',
        })
        .redirect('/')
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns void
 */
export async function mastodonDeAuth(request, reply) {
    const tokenCookie = request.unsignCookie(request.cookies[mastodonTokenCookieName])
    const hostCookie = request.unsignCookie(request.cookies[mastodonHostCookieName])
    if (!tokenCookie.valid) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (!hostCookie.valid) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const mastodonDomain = (new URL(mastodonHost.value)).hostname
    const {client_id, client_secret} = await getMastodonApp.call(this, mastodonDomain)

    if (!client_id || !client_secret) {
        throw new Error('Where are my credentials?!')
    }

    const body = `client_id=${encodeURIComponent(client_id)}` +
                `&client_secret=${encodeURIComponent(client_secret)}` +
                `&token=${encodeURIComponent(tokenCookie.value)}`

    const res = await fetch(`${hostCookie.value}/oauth/revoke`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    })

    if (res.status !== 200) {
        return reply.status(res.status).send()
    }

    reply.clearCookie(mastodonTokenCookieName).send()
}

export async function meHandler(host, token) {
    const url = `${host}/api/v1/accounts/verify_credentials`
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })
    if (response.status !== 200) {
        throw new Error('Mastodon API error')
    }
    return response.json()
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns void
 */
export async function mastodonMe(request, reply) {
    const tokenCookie = request.unsignCookie(request.cookies[mastodonTokenCookieName])
    const hostCookie = request.unsignCookie(request.cookies[mastodonHostCookieName])
    if (!tokenCookie.valid) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (!hostCookie.valid) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const {username} = await meHandler(hostCookie.value, tokenCookie.value)
    reply.send(username)
}
