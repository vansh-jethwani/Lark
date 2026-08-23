export default function AIChatButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Lark AI"
      className="
        flex
        items-center
        justify-center
        text-2xl
        text-default-500
        transition-all
        duration-200
        hover:text-white
        hover:scale-110
        active:scale-95
      "
    >
      < i className="fa-brands fa-accusoft"></i>
    </button>
  );
}