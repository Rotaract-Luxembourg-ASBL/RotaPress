# Files, uploads and recovery

Media supports photographs, PDF documents, audio and video. Administration uploads
start **Public**. Choose **Private** to restrict delivery to authorized staff.
Public file URLs can be opened without signing in, even when no page links to them.
Page publication never changes a file's visibility automatically.

## Supported files

| Type | Accepted content | Maximum per file |
| --- | --- | --- |
| Photograph | Single-frame JPEG, PNG or WebP | 5 MiB and 20 million pixels |
| Document | Unencrypted PDF, up to 2,000 pages | 25 MiB |
| Audio | MP3 or AAC-LC in M4A | 100 MiB |
| Video | H.264 MP4, or VP8/VP9 WebM | 500 MiB and 20 million pixels per frame |

MP4 video may include one AAC-LC audio track; WebM may include one Opus or Vorbis
audio track. The server checks the actual container and codecs. Renaming a file
does not convert it. Unsupported, encrypted, damaged or excessively complex files
receive a recoverable error. Re-export them using a supported format.

Photographs are decoded and normalized to WebP with unnecessary metadata removed.
Other supported files retain their original bytes. PDF files use download cards;
audio and video use native player controls. Files are not transcoded. Image crop,
rotation and thumbnail actions are available only for photographs.

## Video posters, captions and transcripts

Insert a **Video** block and choose its recording from the media library. Choose
an optional **Poster photograph** to show before playback. The poster must be an
image from the same library. Both recording and poster must be Public before the
page can be published; referenced posters receive the same deletion protection as
other page images.

Set the caption language (for example `en`, `fr` or `lb`) and its label in the
player's caption menu. Add **Timed captions** in playback order, specifying start
and end in seconds, including decimals when needed. For example, `62.5` means
1 minute 2.5 seconds. Intervals must not overlap, and each end must follow its
start. A track supports up to 500 captions and 50,000 characters in total. Captions
are plain text; add speaker names and meaningful sounds where helpful. They use
the browser's native caption controls, with captions enabled initially.

The separate **Transcript / audio description** field provides readable text below
the player. It does not replace timed captions. Caption cues belong to the page
draft and its revisions; standalone WebVTT files are not an upload format. The
editor preview and public page use the same player, poster and caption track.

## Upload, pause and resume

Choose **Upload files**, then browse or drop files into the queue. Review visibility
and collection before starting. Up to 100 files can be queued; two files upload at
a time using 4 MiB chunks. Each row shows progress and the final validation result.
The library receives an asset only after every chunk passes validation.

**Pause uploads** retains completed chunks. **Retry failed uploads** resumes them
with the same metadata. After reloading, select the same file again in the same
browser tab to recover its upload. The file is checked against the already stored
chunk hashes. A changed file must start a new upload. Browser storage must remain
available for recovery after reload; in-place retry still works without it.

Remove an unfinished item from the queue to cancel its server upload. Completed
files remain in the library. A successful retry returns the original asset rather
than creating a duplicate. Deleting that asset does not let an old retry recreate it.
Upload sessions expire after 24 hours. The club can reserve at most 20 unfinished
uploads and 1 GiB of unfinished content at once.

## Delivery and access

Every file request checks current visibility. Private delivery checks the current
staff permission and organization. Audio and video support byte-range requests for
seeking; invalid or unsupported multiple ranges receive HTTP 416. HEAD returns
metadata without file bytes. PDFs download as attachments, and all media responses
prevent content sniffing and shared caching. Making a file private cannot recall
copies already downloaded.

## Storage and backups

Final files and temporary upload chunks stay in the private upload volume, outside
the web root. Names are opaque random keys. Staging files cannot be downloaded
through media routes. Expired uploads are cancelled by the existing job runner;
old inaccessible staging files are removed in bounded maintenance batches.
Cleanup retains chunk hashes for duplicate-safe retries. Failed staged-file
deletions retain their keys and wait five minutes before another attempt; one
failed file does not discard the cleanup record or stop other files being removed.

The hosting backup command includes all supported file types and unfinished upload
chunks alongside the database and protected recovery configuration. New upload
archives use checksummed, bounded records so large videos do not need to fit into
memory. Recovery also accepts older image-only archives. Restore into a fresh
recovery installation and verify database and file access together before relying
on the backup. See the [hosting guide](hosting.md#updates-and-backups).

## Operator implementation notes

Non-image validation runs in a short-lived Node subprocess with a restricted
filesystem permission grant, no application credentials, a 128 MiB JavaScript
heap, bounded parser reads and a 30-second parent watchdog. At most two files can
finalize in an application process at once. This is format validation, not malware
scanning. No external processing service or system-wide media executable is used.
