import { twitterMe, twitterTokenCookieName, followingOnTwitter } from "./twitter"
import { mastodonMe, mastodonTokenCookieName, mastodonHostCookieName } from "./mastodon"

export async function addOrUpdateTwitterToMastodonMapping(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterTokenCookieName] == null) {
        throw new Error('No Twitter Authorization Token cookie')
    }
    if (cookie[mastodonTokenCookieName] == null) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }

    const meOnTwitter = await twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)
    const meOnMastodon = await mastodonMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)

    await TWITTER_TO_MASTODON_USERMAP.put(meOnTwitter.data.id, `${meOnMastodon.username}@${cookie[mastodonHostCookieName].replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}`)
}

export async function matchTwitterUserToMastodon(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[mastodonTokenCookieName] == null) {
        throw new Error('No Mastodon Authorization Token cookie')
    }
    if (cookie[mastodonHostCookieName] == null) {
        throw new Error('No Mastodon Hostname cookie')
    }

    return await TWITTER_TO_MASTODON_USERMAP.get(requestBody)
}
