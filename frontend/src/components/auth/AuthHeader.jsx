// import { APP_NAME, AppLogo } from "../AppLogo";
// import { ThemePresetPicker } from "../ThemePresetPicker";
// import { ThemeToggle } from "../ThemeToggle";

// function AuthHeader() {
//   return (
//     <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
//       <div className="flex items-center gap-3">
//         <AppLogo
//           size={36}
//           className="rounded-lg"
//           alt=""
//         />

//         <div>
//           <h1 className="text-xl font-bold">{APP_NAME}</h1>
//           <p className="text-sm text-muted">
//             Private session
//           </p>
//         </div>
//       </div>

//       <div className="flex items-center gap-2">
//         <ThemePresetPicker />
//         <ThemeToggle />
//       </div>
//     </header>
//   );
// }

// export default AuthHeader;


import { APP_NAME, AppLogo } from "../AppLogo";
import { ThemePresetPicker } from "../ThemePresetPicker";
import { ThemeToggle } from "../ThemeToggle";

function AuthHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5 lg:px-8">
      <div className="flex items-center gap-2.5">
        <AppLogo
          size={30}
          className="rounded-md"
          alt=""
        />

        <div className="leading-tight">
          <h1 className="text-lg font-bold tracking-tight">
            {APP_NAME}
          </h1>

          <p className="text-xs text-muted">
            Private session
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <ThemePresetPicker />
        <ThemeToggle />
      </div>
    </header>
  );
}

export default AuthHeader;