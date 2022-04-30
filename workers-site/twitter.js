import { randomBytes } from 'crypto'

export const twitterChallengeCookieName = 'twitterChallenge',
            twitterTokenCookieName = 'twitterToken'

export async function twitterLoginUrl(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    const id = randomBytes(20).toString('hex')
    const challenge = randomBytes(20).toString('hex')
    const CALLBACK_URL = `${protocol}//${hostname}${port ? `:${port}` : ''}/twitterAuth`
    await TWITTER_USER_TOKENS.put(id, challenge, {expirationTtl: 3600})
    return new Response(
        JSON.stringify({
            sessionId: id,
            twitterLoginUrl: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${client_id}&redirect_uri=${CALLBACK_URL}&scope=tweet.read%20users.read%20follows.read&state=${id}&code_challenge=${challenge}&code_challenge_method=plain`
        }), {
            headers: {
                'Content-Type': 'application/json',
            },
        })
}

export async function twitterAuth(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    const id = searchParams.get('state')
    const challenge = randomBytes(20).toString('hex')
    const CALLBACK_URL = `${protocol}//${hostname}${port ? `:${port}` : ''}/twitterAuth`
    await TWITTER_USER_TOKENS.get(id)
    const body = `code=${encodeURIComponent(searchParams.get('code'))}` +
                `&grant_type=${encodeURIComponent('authorization_code')}` +
                `&client_id=${encodeURIComponent(client_id)}` +
                `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
                `&code_verifier=${encodeURIComponent(cookie[twitterChallengeCookieName])}`
    const oauthData = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    })
    const json = await oauthData.json()
    const responseHeaders = new Headers({
        location: `${protocol}//${hostname}${port ? `:${port}` : ''}/`,
        'Set-Cookie': `${twitterTokenCookieName}=${json.access_token}`,
    })
    return new Response(null, {
        status: 301,
        headers: responseHeaders,
    })
}

export async function twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterTokenCookieName] == null) {
        throw new Error('No Twitter Authorization Token cookie')
    }
    const me = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
            Authorization: `Bearer ${cookie[twitterTokenCookieName]}`,
        },
    })
    return await me.json() 
}

export async function followingOnTwitter(cookie, protocol, hostname, port, pathname, searchParams, requestBody) {
    if (cookie[twitterTokenCookieName] == null) {
        throw new Error('No Twitter Authorization Token cookie')
    }

    const userId = (await twitterMe(cookie, protocol, hostname, port, pathname, searchParams, requestBody)).data.id
    
    async function getPage(nextToken) {
        return await fetch(`https://api.twitter.com/2/users/${userId}/following?max_results=1000${nextToken ? `&pagination_token=${nextToken}` : ''}`, {
            headers: {
                Authorization: `Bearer ${cookie[twitterTokenCookieName]}`,
            },
        })
    }

    let hasNextPage = true;
    let nextToken = null;
    const users = []
    while (hasNextPage) {
        const following = await getPage(nextToken)
        const resp = await following.json()
        if ('status' in resp && resp.status !== 200) {
            break;
        }
        if (resp && resp.meta && resp.meta.result_count && resp.meta.result_count > 0) {
            if (resp.data) {
                users.push(resp.data);
            }
            if (resp.meta.next_token) {
                nextToken = resp.meta.next_token;
            } else {
                hasNextPage = false;
            }
        } else {
            hasNextPage = false;
        }
    }

    return users.flat(1)
}