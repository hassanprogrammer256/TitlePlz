Real H.264 MP4 files (3.2 s, 320x180) produced by ffmpeg, used to check the MP4 header parser
against an actual encoder rather than only synthetic boxes:

- clip-faststart.mp4: `-movflags +faststart` (moov before mdat)
- clip-moovlast.mp4: ffmpeg's default layout (moov after mdat)
- clip-fragmented.mp4: `-movflags frag_keyframe+empty_moov` (fragmented; mvhd duration is 0)

Regenerate: ffmpeg -f lavfi -i testsrc=size=320x180:rate=25 -t 3.2 -pix_fmt yuv420p -c:v libx264 <flags> out.mp4
