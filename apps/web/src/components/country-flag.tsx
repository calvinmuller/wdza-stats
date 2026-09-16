// Renders nothing when countryCode is null/unknown - same optional-rendering
// convention as PlayerAvatar. Converts an ISO 3166-1 alpha-2 code (Steam's
// loccountrycode, e.g. "ZA") into its Unicode regional-indicator flag emoji.
export function CountryFlag({ countryCode }: { countryCode: string | null }) {
  if (!countryCode || countryCode.length !== 2) {
    return null;
  }

  const codePoints = [...countryCode.toUpperCase()].map(
    (char) => 127397 + char.charCodeAt(0),
  );

  return (
    <span aria-label={countryCode} title={countryCode}>
      {String.fromCodePoint(...codePoints)}
    </span>
  );
}
