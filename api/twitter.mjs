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
    const redirectUri = new URL(`${request.protocol}://${request.hostname}/twitterAuth`)

    await this.mongo.db.collection('twitter_user_tokens').insertOne({
        _id: id,
        challenge,
        CreatedDate: new Date(),
    })

    reply.send({
        twitterLoginUrl: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirectUri.href)}&scope=tweet.read%20users.read%20follows.read&state=${id}&code_challenge=${challenge}&code_challenge_method=plain`
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
    const redirectUri = new URL(`${request.protocol}://${request.hostname}/twitterAuth`)

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
        return reply.code(oauthData.status).clearCookie(twitterTokenCookieName).send()
    }

    if (!'expires_in' in json || !json.expires_in || json.expires_in <= 0) {
        json.expires_in = 3600
    }
    json.expires_in = Math.min(json.expires_in, 3600)

    reply
        .setCookie(twitterTokenCookieName, json.access_token, {
            maxAge: json.expires_in,
            signed: true,
            sameSite: 'lax',
        })
        .redirect('/')
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
    return data.json()
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
        const response = await fetch(
            `https://api.twitter.com/2/users/${userId}/following?max_results=1000${nextToken}`,
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
        nextToken = `&pagination_token=${json.meta.next_token}`
    }

    reply.send(users.flat(1))
}