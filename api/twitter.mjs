import fetch from 'node-fetch'
import { randomBytes } from 'crypto'

export const twitterTokenCookieName = 'twitterToken'

const client_id = process.env.TWITTER_CLIENT_ID

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function twitterLoginUrl(request, reply) {
    const id = randomBytes(32).toString('hex')
    const challenge = randomBytes(32).toString('hex')
    const redirectUri = new URL('/twitterAuth', `${request.protocol}://${request.hostname}/`)

    await this.mongo.db.collection('twitter_user_tokens').insertOne({
        _id: id,
        challenge,
        CreatedDate: new Date(),
    })

    const twitterLoginUrl = new URL('/i/oauth2/authorize', 'https://twitter.com/')
    twitterLoginUrl.searchParams.set('response_type', 'code')
    twitterLoginUrl.searchParams.set('client_id', client_id)
    twitterLoginUrl.searchParams.set('redirect_uri', redirectUri.href)
    twitterLoginUrl.searchParams.set('state', id)
    twitterLoginUrl.searchParams.set('scope', 'tweet.read users.read follows.read')
    twitterLoginUrl.searchParams.set('code_challenge', challenge)
    twitterLoginUrl.searchParams.set('code_challenge_method', 'plain')

    reply.send({
        twitterLoginUrl: twitterLoginUrl.href
    })
}

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function twitterAuth(request, reply) {
    const id = request.query.state
    const {challenge} = await this.mongo.db.collection('twitter_user_tokens').findOne({ _id: id })
    const redirectUri = new URL('/twitterAuth', `${request.protocol}://${request.hostname}/`)

    const body = `code=${encodeURIComponent(request.query.code)}` +
                '&grant_type=authorization_code' +
                `&client_id=${encodeURIComponent(client_id)}` +
                `&redirect_uri=${encodeURIComponent(redirectUri.href)}` +
                `&code_verifier=${encodeURIComponent(challenge)}`

    const oauthData = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    })

    const json = await oauthData.json()

    if (oauthData.status !== 200) {
        return reply.send(json)
    }

    if (!'expires_in' in json || !json.expires_in || json.expires_in <= 0) {
        json.expires_in = 3600
    }
    json.expires_in = Math.min(json.expires_in, 3600)

    reply
        .setCookie(twitterTokenCookieName, json.access_token, {
            maxAge: json.expires_in,
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
export async function twitterDeAuth(request, reply) {
    const token = request.unsignCookie(request.cookies[twitterTokenCookieName])
    if (!token.valid) {
        throw new Error('No Twitter Authorization Token cookie')
    }

    const body = `token=${encodeURIComponent(token.value)}` +
                '&token_type_hint=access_token' +
                `&client_id=${encodeURIComponent(client_id)}`

    const res = await fetch('https://api.twitter.com/2/oauth2/revoke', {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    })

    const text = await res.text()

    if (res.status !== 200) {
        return reply.code(res.status).send(text)
    }

    reply.clearCookie(twitterTokenCookieName).send()
}

export async function meHandler(token) {
    const data = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    })
    if (data.status !== 200) {
        throw new Error('Twitter API Error')
    }
    return await data.json()
}

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function twitterMe(request, reply) {
    const token = request.unsignCookie(request.cookies[twitterTokenCookieName])
    if (!token.valid) {
        throw new Error('No Twitter Authorization Token cookie')
    }
    reply.send((await meHandler(token.value)).data.username)
}

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function followingOnTwitter(request, reply) {
    const token = request.unsignCookie(request.cookies[twitterTokenCookieName])
    if (!token.valid) {
        throw new Error('No Twitter Authorization Token cookie')
    }

    const { data: { id: userId } } = await meHandler(token.value)

    let nextToken = '';
    const users = []
    while (true) {
        const url = new URL(`/2/users/${userId}/following`, 'https://api.twitter.com/')
        url.searchParams.set('max_results', 1000)
        if (nextToken) {
            url.searchParams.set('pagination_token', nextToken)
        }
        const response = await fetch(url,
            { headers: { Authorization: `Bearer ${token.value}` } }
        )
        if (!response.ok) {
            break
        }

        const json = await response.json()
        if (!(json && json.meta && json.meta.result_count && json.meta.result_count > 0)) {
            break
        }

        if (json.data) {
            users.push(json.data)
        }

        if (!json.meta.next_token) {
            break
        }
        nextToken = json.meta.next_token
    }

    reply.send(users.flat(1))
}