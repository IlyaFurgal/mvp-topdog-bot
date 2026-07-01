export default function MvpRibbon() {
  return (
    <div className="mvp-ribbon">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="mvp-ribbon__unit">
          <b>MVP</b><i>BY TOP DOG</i>
        </span>
      ))}
    </div>
  )
}
