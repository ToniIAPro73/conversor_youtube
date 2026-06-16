# Privacy

Anclora FileStudio is local-first. Desktop and Local Agent do not require Docker and do not open inbound ports.

The Service mode is private infrastructure, not local execution. Logs must not contain file content, full temporary URLs, Authorization headers, tokens, private keys, private local paths or full sensitive names.

Local Agent default consent policy is `ask-always`; non-TTY mode rejects jobs instead of silently accepting them.
