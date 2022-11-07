import { meHandler as twitterMe, twitterTokenCookieName } from "./twitter.mjs"
import { meHandler as mastodonMe, mastodonTokenCookieName, mastodonHostCookieName } from "./mastodon.mjs"

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function addOrUpdateTwitterToMastodonMapping(request, reply) {
    const twitterToken = request.unsignCookie(request.cookies[twitterTokenCookieName])
    const mastodonToken = request.unsignCookie(request.cookies[mastodonTokenCookieName])
    const mastodonHost = request.unsignCookie(request.cookies[mastodonHostCookieName])
    if (!twitterToken.valid) {
        throw new Error('No Twitter Authorization Token cookie')
    }
    if (!mastodonToken.valid) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (!mastodonHost.valid) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const { data: { id: twitter_id } } = await twitterMe(twitterToken.value)
    const { username: mastodon_id } = await mastodonMe(mastodonHost.value, mastodonToken.value)

    await this.mongo.db.collection('twitter_to_mastodon_usermap').updateOne({
        _id: twitter_id,
    }, {
        $set: {
            _id: twitter_id,
            mastodon_id: `${mastodon_id}@${new URL(mastodonHost.value).hostname}`,
        },
    }, {
        upsert: true,
    })

    reply.send()
}

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
 export async function removeTwitterToMastodonMapping(request, reply) {
    const twitterToken = request.unsignCookie(request.cookies[twitterTokenCookieName])

    if (!twitterToken.valid) {
        throw new Error('No Twitter Authorization Token cookie')
    }

    const { data: { id: twitter_id } } = await twitterMe(twitterToken.value)

    await this.mongo.db.collection('twitter_to_mastodon_usermap').deleteOne({
        _id: twitter_id,
    })

    reply.send()
}

/**
 * @param {import('fastify').FastifyRequest} request 
 * @param {import('fastify').FastifyReply} reply 
 * @returns void
 */
export async function matchTwitterUserToMastodon(request, reply) {
    const mastodonToken = request.unsignCookie(request.cookies[mastodonTokenCookieName])
    const mastodonHost = request.unsignCookie(request.cookies[mastodonHostCookieName])
    if (!mastodonToken.valid) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (!mastodonHost.valid) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const result = await this.mongo.db.collection('twitter_to_mastodon_usermap').findOne({ _id: request.body })
    if (result) {
        return reply.send(result.mastodon_id)
    }
    reply.status(404).send()
}
