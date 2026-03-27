#!/bin/bash
# Download the PodcastIndex database
# This database is publicly available and updated regularly
# Size: ~1.7 GB compressed, ~4.6 GB uncompressed

echo "Downloading PodcastIndex database..."
echo "This may take 10-30 minutes depending on your connection."
echo ""

# Download compressed database
curl -L "https://public.podcastindex.org/podcastindex_feeds.db.tgz" -o podcastindex_feeds.db.tgz

echo ""
echo "Extracting database..."
tar xzf podcastindex_feeds.db.tgz

echo ""
echo "Done! Database is ready at: podcastindex_feeds.db"
echo "Size: $(du -h podcastindex_feeds.db 2>/dev/null || echo '~4.6 GB')"
