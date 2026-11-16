/* InSyte wordmark (concept B), vectorised. Theme-adaptive: the "In" and the
 * caption use currentColor so they read on both the pastel and dark grounds;
 * the "Syte" gradient reads on either. Transparent, cropped tight. */
export default function InSyteLogo({ height = 38 }: { height?: number }) {
  return (
    <svg
      viewBox="70 150 900 400"
      role="img"
      aria-label="InSyte, by Inner Capital"
      style={{ height, width: "auto", display: "block", color: "var(--ink)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="insyte-grad" x1="337" y1="300" x2="935" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff7e9d" />
          <stop offset="0.4" stopColor="#e783bd" />
          <stop offset="1" stopColor="#9b8cff" />
        </linearGradient>
      </defs>
      <g fill="currentColor">
        <rect x="95" y="189" width="59" height="218" rx="29.5" />
        <path d="M173 274 C173 257 184 244 200 244 C213 244 222 250 227 262 C238 249 251 242 271 242 C307 242 329 265 329 304 L329 377 C329 395 318 407 300 407 C282 407 271 395 271 377 L271 316 C271 300 265 291 251 291 C237 291 230 302 230 318 L230 377 C230 395 219 407 201 407 C184 407 173 395 173 377 Z" />
      </g>
      <g fill="url(#insyte-grad)">
        <path d="M418 183 C443 183 467 190 483 204 C495 214 496 231 486 242 C477 253 464 254 451 245 C439 236 428 231 417 231 C404 231 397 237 397 246 C397 257 406 262 429 270 C473 284 500 302 500 341 C500 384 466 410 419 410 C391 410 364 401 346 385 C334 374 333 359 343 347 C353 335 368 335 381 345 C393 355 407 362 420 362 C433 362 440 356 440 347 C440 336 431 330 405 321 C363 307 338 289 338 249 C338 210 370 183 418 183 Z" />
        <path d="M497 280 C490 263 497 249 512 244 C528 238 542 245 548 261 L578 333 L604 263 C610 246 624 239 640 244 C657 249 664 264 657 281 L596 420 C586 444 567 456 540 456 C518 456 506 448 506 432 C506 417 516 408 532 408 C542 408 547 402 551 391 Z" />
        <path d="M678 244 L678 229 C678 211 689 200 706 200 C723 200 735 212 735 229 L735 244 L749 244 C763 244 772 253 772 266 C772 279 763 287 749 287 L735 287 L735 348 C735 359 740 364 749 363 C761 361 770 369 772 381 C774 396 762 407 744 409 C701 414 678 392 678 352 L678 287 C665 287 657 279 657 266 C657 253 665 245 678 244 Z" />
        <path fillRule="evenodd" d="M855 240 C904 240 935 271 935 315 C935 331 926 340 910 340 L827 340 C831 357 843 366 860 366 C873 366 883 362 893 357 C905 350 918 354 923 365 C930 378 922 391 910 397 C894 405 878 410 855 410 C804 410 770 377 770 326 C770 276 804 240 855 240 Z M827 307 L879 307 C877 291 868 282 854 282 C840 282 830 291 827 307 Z" />
      </g>
      <g fill="currentColor" opacity="0.5">
        <text x="516" y="513" textAnchor="middle" fontFamily="Nunito, Quicksand, Arial, sans-serif" fontSize="39" fontWeight="600" letterSpacing="10">BY INNER CAPITAL</text>
      </g>
    </svg>
  );
}
