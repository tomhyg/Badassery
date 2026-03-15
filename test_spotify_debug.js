const { scrapeSpotifyRating } = require('./scripts/utils/spotifyRating');
const { getBrowser, closeBrowser } = require('./scripts/utils/browserManager');

(async () => {
  const urls = [
    'https://open.spotify.com/show/6URqjmbu5DUmUs8HaLe1Ze',
    'https://open.spotify.com/show/5KQj8MsxHQlcwjno1SEDRZ',
    'https://open.spotify.com/show/4S6ykQtu6fFoUEbHP2bYde',
  ];
  const browser = await getBrowser();
  for (const url of urls) {
    const result = await scrapeSpotifyRating(url, browser);
    console.log(url.split('/').pop(), '→', JSON.stringify(result));
  }
  await closeBrowser();
})();
