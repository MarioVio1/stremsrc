/*
written by github.com/cool-dev-guy
modified and updated by github.com/theditor
*/

import { ContentType } from "stremio-addon-sdk";
import * as cheerio from "cheerio";

let BASEDOM = "https://cloudnestra.com";
const SOURCE_URL = "https://vixsrc.to";

interface Servers {
  name: string | null;
  dataHash: string | null;
}
interface APIResponse {
  name: string | null;
  image: string | null;
  mediaId: string | null;
  stream: string | null;
  referer: string;
}
interface RCPResponse {
  metadata: {
    image: string;
  };
  data: string;
}
async function serversLoad(html: string): Promise<{ servers: Servers[]; title: string }> {
  const $ = cheerio.load(html);
  const servers: Servers[] = [];
  const title = $("title").text() ?? "";
  const base = $("iframe").attr("src") ?? "";
  BASEDOM = new URL(base.startsWith("//") ? "https:" + base : base).origin ?? BASEDOM;
  $(".serversList .server").each((index, element) => {
    const server = $(element);
    servers.push({
      name: server.text().trim(),
      dataHash: server.attr("data-hash") ?? null,
    });
  });
  return {
    servers: servers,
    title: title,
  };
}

async function PRORCPhandler(prorcp: string): Promise<string | null> {
  try {
    const prorcpFetch = await fetch(`${BASEDOM}/prorcp/${prorcp}`, {
      headers: {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "priority": "u=1",
        "sec-ch-ua": "\"Chromium\";v=\"128\", \"Not;A=Brand\";v=\"24\", \"Google Chrome\";v=\"128\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
        'Sec-Fetch-Dest': 'iframe',
        "Referer": `${BASEDOM}/`,
        "Referrer-Policy": "origin",
      },
    });
    if (!prorcpFetch.ok) {
      return null;
    }
    const prorcpResponse = await prorcpFetch.text();
    const regex = /file:\s*'([^']*)'/gm;
    const match = regex.exec(prorcpResponse);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function rcpGrabber(html: string): Promise<RCPResponse | null> {
  const regex = /src:\s*'([^']*)'/;
  const match = html.match(regex);
  if (!match) return null;
  return {
    metadata: {
      image: "",
    },
    data: match[1],
  };
}

function getObject(id: string) {
  const arr = id.split(':');
  return {
    id: arr[0],
    season: arr[1],
    episode: arr[2]
  }
}

export function getUrl(id: string, type: ContentType) {
  if (type == "movie") {
    return `${SOURCE_URL}/movie/${id}`;
  } else {
    // fallback to series
    const obj = getObject(id);
    return `${SOURCE_URL}/tv/${obj.id}/${obj.season}-${obj.episode}`;
  }
}

async function getStreamContent(id: string, type: ContentType) {
  const url = getUrl(id, type);
  const embed = await fetch(url);
  const embedResp = await embed.text();

  // get some metadata
  const { servers, title } = await serversLoad(embedResp);

  const rcpFetchPromises = servers.map(element => {
    return fetch(`${BASEDOM}/rcp/${element.dataHash}`, {
      headers: {
        'Sec-Fetch-Dest': 'iframe'
      }
    });
  });
  const rcpResponses = await Promise.all(rcpFetchPromises);

  const prosrcrcp = await Promise.all(rcpResponses.map(async (response, i) => {
    return rcpGrabber(await response.text());
  }));

  const apiResponse: APIResponse[] = [];
  for (const item of prosrcrcp) {
    if (!item) continue;
    switch (item.data.substring(0, 8)) {
      case "/prorcp/":
        apiResponse.push({
          name: title,
          image: item.metadata.image,
          mediaId: id,
          stream: await PRORCPhandler(item.data.replace("/prorcp/", "")),
          referer: BASEDOM,
        });
        break;
    }
  }
  return apiResponse;
}
export { getStreamContent };
