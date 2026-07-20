# Local prep only — not submitted to homebrew/cask or a personal tap yet.
#
# Install once a tap hosts this file, e.g.:
#   brew install --cask L0nE-F0x/tap/filthy-net-deck
#
# Or test a local path (Homebrew on macOS):
#   brew install --cask --force ./packaging/homebrew/filthy-net-deck.rb
#
# Artifact: universal dmg already published at website/downloads/ and the v1.5.1 GitHub release.
cask "filthy-net-deck" do
  version "1.5.1"
  sha256 "d7aa3a831374df68d95180b36afe8bef69a2ebd0ec11745fe2e9b0448c50281f"

  url "https://github.com/L0nE-F0x/Filthy-Net-Deck/releases/download/v#{version}/Filthy-Net-Deck-#{version}-universal.dmg",
      verified: "github.com/L0nE-F0x/Filthy-Net-Deck/"
  name "Filthy Net Deck"
  desc "Desktop MTG Arena meta companion — Standard & Pioneer lists, Brew Lab, local tracker"
  homepage "https://filthy-net-deck.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :catalina"

  app "Filthy Net Deck.app"

  zap trash: [
    "~/Library/Application Support/com.filthynetdeck.desktop",
    "~/Library/Caches/com.filthynetdeck.desktop",
    "~/Library/Preferences/com.filthynetdeck.desktop.plist",
    "~/Library/WebKit/com.filthynetdeck.desktop",
  ]
end
