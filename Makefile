CCRED=\033[0;31m
CCEND=\033[0m

localConfig       := ./vanityURLs.conf
include           $(localConfig)

.PHONY: help

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {sub("\\\\n",sprintf("\n%22c"," "), $$2);printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

debug:
	echo $(MY_DOMAIN)
	[ -f $(localConfig) ] && source $(localConfig)

config: ## Modify the .vanityURLs.conf before running setup
	@vi $(localConfig)

setup: ## Setup the environment
	cp vanityURLs.conf ~/.vanityURLs.conf

	mkdir -p $(SCRIPT_DIR)
	cp scripts/* $(SCRIPT_DIR)
	chmod +x $(SCRIPT_DIR)/lnk
	chmod +x $(SCRIPT_DIR)/validateURL

	mkdir -p build
	rm build/_headers 2> /dev/null || true
	echo "https://"$(MY_PAGE)"/*" > build/_headers
	echo "  X-Robots-Tag: noindex" >> build/_headers
	echo "  X-Content-Type-Options: nosniff" >> build/_headers
	echo "  " >> build/_headers
	echo "https://"$(MY_DOMAIN)"/*" >> build/_headers
	echo "  X-Robots-Tag: noindex" >> build/_headers
	echo "  X-Content-Type-Options: nosniff" >> build/_headers

	rm dynamic.lnk 2> /dev/null || true
	echo "/github/* https://github.com/bhdicaire/:splat" > dynamic.lnk

	rm static.lnk 2> /dev/null || true
	echo "/bhd https://bhdicaire.com/" > static.lnk
	echo "/linkedin https://linkedin.com/in/bhdicaire/" >> static.lnk
	echo "/x https://twitter.com/BHDicaire/" >> static.lnk
	echo "/github https://github.com/bhdicaire/" >> static.lnk
	echo "/gitlab https://gitlab.com/bhdicaire/" >> static.lnk
	echo "  " >> static.lnk
	echo "/blog https://blog.example/" >> static.lnk
	echo "/mail https://outlook.office.com/" >> static.lnk
	echo "/gmail https://gmail.com/" >> static.lnk
	echo "/slack https://example.slack.com/" >> static.lnk
